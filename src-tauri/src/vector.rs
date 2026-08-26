use async_trait::async_trait;
use arrow_array::{FixedSizeListArray, Float32Array, RecordBatch, RecordBatchIterator, StringArray};
use arrow_schema::{DataType, Field, Schema};
use futures_util::StreamExt;
use lancedb::connect;
use lancedb::query::{ExecutableQuery, QueryBase};
use serde_json::Value;
use std::error::Error;
use std::sync::Arc;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VectorRecord {
    pub id: String,
    pub vector: Vec<f32>,
    pub payload: Value,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchQuery {
    pub vector: Vec<f32>,
    pub limit: usize,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub record: VectorRecord,
    pub distance: f32,
}

#[async_trait]
pub trait VectorStore: Send + Sync {
    async fn initialize(&self, collection: &str) -> Result<(), Box<dyn Error + Send + Sync>>;
    async fn upsert(&self, collection: &str, records: &[VectorRecord]) -> Result<(), Box<dyn Error + Send + Sync>>;
    async fn query(&self, collection: &str, query: &SearchQuery) -> Result<Vec<SearchResult>, Box<dyn Error + Send + Sync>>;
    async fn delete(&self, collection: &str, filter: &str) -> Result<(), Box<dyn Error + Send + Sync>>;
    async fn drop_collection(&self, collection: &str) -> Result<(), Box<dyn Error + Send + Sync>>;
    async fn get_all(&self, collection: &str) -> Result<Vec<VectorRecord>, Box<dyn Error + Send + Sync>>;
}

pub struct LanceDbStore {
    db_dir: String,
}

impl LanceDbStore {
    pub fn new(db_dir: String) -> Self {
        Self { db_dir }
    }

    fn get_schema(&self, dim: usize) -> Arc<Schema> {
        Arc::new(Schema::new(vec![
            Field::new("id", DataType::Utf8, false),
            Field::new("document_id", DataType::Utf8, false),
            Field::new("agent_id", DataType::Utf8, true),
            Field::new("vector", DataType::FixedSizeList(
                Arc::new(Field::new("item", DataType::Float32, true)),
                dim as i32,
            ), false),
            Field::new("text", DataType::Utf8, false),
            Field::new("metadata", DataType::Utf8, false),
        ]))
    }

    fn make_batch(&self, dim: usize, records: &[VectorRecord]) -> Result<RecordBatch, Box<dyn Error + Send + Sync>> {
        let schema = self.get_schema(dim);

        let ids: Vec<&str> = records.iter().map(|r| r.id.as_str()).collect();
        let id_array = StringArray::from(ids);

        let doc_ids: Vec<&str> = records.iter().map(|r| {
            r.payload.get("document_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
        }).collect();
        let doc_id_array = StringArray::from(doc_ids);

        let agent_ids: Vec<Option<&str>> = records.iter().map(|r| {
            r.payload.get("agent_id")
                .and_then(|v| v.as_str())
        }).collect();
        let agent_id_array = StringArray::from(agent_ids);

        let mut flat_vectors = Vec::with_capacity(records.len() * dim);
        for r in records {
            if r.vector.len() != dim {
                return Err(format!("Vector dimension mismatch: expected {}, got {}", dim, r.vector.len()).into());
            }
            flat_vectors.extend_from_slice(&r.vector);
        }
        let values_array = Float32Array::from(flat_vectors);
        let vector_array = FixedSizeListArray::try_new(
            Arc::new(Field::new("item", DataType::Float32, true)),
            dim as i32,
            Arc::new(values_array),
            None,
        )?;

        let texts: Vec<&str> = records.iter().map(|r| {
            r.payload.get("text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
        }).collect();
        let text_array = StringArray::from(texts);

        let metadatas: Vec<String> = records.iter().map(|r| {
            // Strip text from metadata representation to avoid redundancy
            let mut payload_clean = r.payload.clone();
            if let Value::Object(ref mut map) = payload_clean {
                map.remove("text");
            }
            serde_json::to_string(&payload_clean).unwrap_or_default()
        }).collect();
        let metadata_array = StringArray::from(metadatas);

        let batch = RecordBatch::try_new(
            schema,
            vec![
                Arc::new(id_array),
                Arc::new(doc_id_array),
                Arc::new(agent_id_array),
                Arc::new(vector_array),
                Arc::new(text_array),
                Arc::new(metadata_array),
            ],
        )?;

        Ok(batch)
    }
}

#[async_trait]
impl VectorStore for LanceDbStore {
    async fn initialize(&self, _collection: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        std::fs::create_dir_all(&self.db_dir)?;
        Ok(())
    }

    async fn upsert(&self, collection: &str, records: &[VectorRecord]) -> Result<(), Box<dyn Error + Send + Sync>> {
        if records.is_empty() {
            return Ok(());
        }

        let dim = records[0].vector.len();
        let batch = self.make_batch(dim, records)?;
        let schema = self.get_schema(dim);

        let conn = connect(&self.db_dir).execute().await?;
        let table_names = conn.table_names().execute().await?;

        if table_names.contains(&collection.to_string()) {
            let table = conn.open_table(collection).execute().await?;
            let batch_iter = RecordBatchIterator::new(vec![Ok(batch)].into_iter(), schema);
            let reader: Box<dyn arrow_array::RecordBatchReader + Send> = Box::new(batch_iter);
            table.add(reader).execute().await?;
        } else {
            let batch_iter = RecordBatchIterator::new(vec![Ok(batch)].into_iter(), schema);
            let reader: Box<dyn arrow_array::RecordBatchReader + Send> = Box::new(batch_iter);
            conn.create_table(collection, reader).execute().await?;
        }

        Ok(())
    }

    async fn query(&self, collection: &str, query: &SearchQuery) -> Result<Vec<SearchResult>, Box<dyn Error + Send + Sync>> {
        let conn = connect(&self.db_dir).execute().await?;
        let table_names = conn.table_names().execute().await?;

        if !table_names.contains(&collection.to_string()) {
            return Ok(Vec::new());
        }

        let table = conn.open_table(collection).execute().await?;
        
        let mut search_builder = table.vector_search(query.vector.clone())?
            .limit(query.limit);

        if let Some(ref filter_str) = query.filter {
            search_builder = search_builder.only_if(filter_str.clone());
        }

        let mut stream = search_builder.execute().await?;
        let mut results = Vec::new();

        while let Some(batch_result) = stream.next().await {
            let batch = batch_result?;
            
            let id_array = batch.column_by_name("id")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing id column in search results")?;
            
            let text_array = batch.column_by_name("text")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing text column in search results")?;
            
            let metadata_array = batch.column_by_name("metadata")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing metadata column in search results")?;

            let distance_array = batch.column_by_name("_distance")
                .and_then(|c| c.as_any().downcast_ref::<Float32Array>());

            for i in 0..batch.num_rows() {
                let id = id_array.value(i).to_string();
                let text = text_array.value(i).to_string();
                let metadata_str = metadata_array.value(i);
                
                let mut payload: Value = serde_json::from_str(metadata_str).unwrap_or(Value::Null);
                if let Value::Object(ref mut map) = payload {
                    map.insert("text".to_string(), Value::String(text));
                }

                let distance = distance_array.map(|arr| arr.value(i)).unwrap_or(0.0);

                results.push(SearchResult {
                    record: VectorRecord {
                        id,
                        vector: Vec::new(), // Vector data is omitted in result payload
                        payload,
                    },
                    distance,
                });
            }
        }

        Ok(results)
    }

    async fn delete(&self, collection: &str, filter: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let conn = connect(&self.db_dir).execute().await?;
        let table_names = conn.table_names().execute().await?;

        if !table_names.contains(&collection.to_string()) {
            return Ok(());
        }

        let table = conn.open_table(collection).execute().await?;
        table.delete(filter).await?;
        Ok(())
    }

    async fn drop_collection(&self, collection: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let conn = connect(&self.db_dir).execute().await?;
        conn.drop_table(collection, &[]).await?;
        Ok(())
    }

    async fn get_all(&self, collection: &str) -> Result<Vec<VectorRecord>, Box<dyn Error + Send + Sync>> {
        let conn = connect(&self.db_dir).execute().await?;
        let table_names = conn.table_names().execute().await?;

        if !table_names.contains(&collection.to_string()) {
            return Ok(Vec::new());
        }

        let table = conn.open_table(collection).execute().await?;
        
        let mut stream = table.query().execute().await?;
        let mut results = Vec::new();

        while let Some(batch_result) = stream.next().await {
            let batch = batch_result?;
            
            let id_array = batch.column_by_name("id")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing id column in search results")?;
            
            let text_array = batch.column_by_name("text")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing text column in search results")?;
            
            let metadata_array = batch.column_by_name("metadata")
                .and_then(|c| c.as_any().downcast_ref::<StringArray>())
                .ok_or("Missing metadata column in search results")?;

            for i in 0..batch.num_rows() {
                let id = id_array.value(i).to_string();
                let text = text_array.value(i).to_string();
                let metadata_str = metadata_array.value(i);
                
                let mut payload: Value = serde_json::from_str(metadata_str).unwrap_or(Value::Null);
                if let Value::Object(ref mut map) = payload {
                    map.insert("text".to_string(), Value::String(text));
                }

                results.push(VectorRecord {
                    id,
                    vector: Vec::new(), // Omitted for efficiency
                    payload,
                });
            }
        }

        Ok(results)
    }
}
