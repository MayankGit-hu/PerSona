use crate::db::{Database, DocumentRecord};
use crate::chunker::chunk_text;
use crate::models::ModelProvider;
use crate::parser::extract_text;
use crate::vector::{LanceDbStore, SearchQuery, SearchResult, VectorRecord, VectorStore};
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

pub struct RagCoordinator {
    pub provider: Arc<dyn ModelProvider>,
    pub store: Arc<LanceDbStore>,
    pub db: Arc<Database>,
    pub embedding_model: String,
    /// GPU layers to offload (-1 = auto, 0 = CPU only)
    pub num_gpu: Option<i32>,
    /// Context window size in tokens
    pub num_ctx: Option<usize>,
}

impl RagCoordinator {
    pub fn new(
        provider: Arc<dyn ModelProvider>,
        store: Arc<LanceDbStore>,
        db: Arc<Database>,
        embedding_model: String,
    ) -> Self {
        Self {
            provider,
            store,
            db,
            embedding_model,
            num_gpu: None,
            num_ctx: None,
        }
    }

    #[allow(dead_code)]
    pub fn with_runtime_settings(mut self, num_gpu: Option<i32>, num_ctx: Option<usize>) -> Self {
        self.num_gpu = num_gpu;
        self.num_ctx = num_ctx;
        self
    }

    pub async fn ingest_file(&self, filepath: &str, agent_id: Option<String>, collection_id: Option<String>, force: bool) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let path = Path::new(filepath);
        if !path.exists() {
            return Err(format!("File does not exist: {}", filepath).into());
        }

        // Read file bytes to compute a stable, deterministic content hash.
        // NOTE: DefaultHasher is NOT stable across restarts — use FNV-1a instead so
        // the already_indexed cache stays valid across app launches.
        let file_bytes = std::fs::read(path)?;
        let file_hash = {
            let mut h: u64 = 0xcbf29ce484222325;
            for &b in &file_bytes { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
            format!("{:x}", h)
        };
        let file_size = file_bytes.len() as i64;

        let file_name = path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(filepath);

        // Check if file is already ingested and unchanged (including excluded records)
        let all_documents = self.db.list_all_documents()?;
        if let Some(existing) = all_documents.iter().find(|d| d.filepath == filepath) {
            if existing.status == "excluded" {
                if force {
                    // Manual selection or force: delete excluded record first so we can re-ingest
                    self.delete_document(&existing.id).await?;
                } else {
                    // User explicitly deleted this file from the knowledge base
                    // Do not re-ingest it in background watcher scans
                    return Ok("processing_skipped_excluded".to_string());
                }
            } else if existing.file_hash == file_hash && existing.status == "completed" {
                if !force {
                    // File unchanged, skip ingestion
                    return Ok("already_indexed".to_string());
                } else {
                    // Force re-ingest requested: delete old document entry and re-index
                    self.delete_document(&existing.id).await?;
                }
            } else {
                // File changed or failed, remove previous index registry and vectors first
                self.delete_document(&existing.id).await?;
            }
        }

        // Create temporary DB record with "processing" status
        let doc_id = Uuid::new_v4().to_string();
        let doc_record = DocumentRecord {
            id: doc_id.clone(),
            filepath: filepath.to_string(),
            file_hash: file_hash.clone(),
            file_size,
            status: "processing".to_string(),
            ingested_at: Utc::now().to_rfc3339(),
            agent_id: agent_id.clone(),
            category: None,
            collection_id: collection_id.clone(),
        };
        self.db.upsert_document(&doc_record)?;

        println!("RAG: Starting ingestion for file: {}", filepath);
        
        // Extract text
        println!("RAG: Extracting text from file...");
        let extracted_text = match extract_text(filepath) {
            Ok(txt) => txt,
            Err(e) => {
                let mut failed_record = doc_record.clone();
                failed_record.status = format!("failed: {}", e);
                let _ = self.db.upsert_document(&failed_record);
                return Err(e);
            }
        };

        // Determine settings for LLM-assisted parsing
        let llm_parsing_enabled = self.db.get_setting("llm_parsing_enabled")
            .ok()
            .flatten()
            .map(|s| s == "true")
            .unwrap_or(false);

        let llm_parsing_model = self.db.get_setting("llm_parsing_model")
            .ok()
            .flatten()
            .unwrap_or_else(|| "llama3.2:latest".to_string());

        let num_gpu = self.db.get_setting("ollama_num_gpu")
            .ok()
            .flatten()
            .and_then(|s| s.parse::<i32>().ok())
            .unwrap_or(-1);

        let num_ctx = self.db.get_setting("ollama_num_ctx")
            .ok()
            .flatten()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(4096);

        let mut doc_summary = format!("File: {}", file_name);

        if llm_parsing_enabled {
            println!("RAG: Running LLM-assisted document summarization using model: {}", llm_parsing_model);
            let summary_input = if extracted_text.len() > 6000 {
                &extracted_text[..6000]
            } else {
                &extracted_text
            };

            let options = crate::models::GenerateOptions {
                model_name: llm_parsing_model.clone(),
                temperature: 0.1,
                max_tokens: Some(200),
                system_prompt: Some("You are a professional document analysis agent. Summarize the given document in a single, objective sentence. Return ONLY the 1-sentence summary, do not include any other text.".to_string()),
                stop_sequences: Vec::new(),
                json_mode: false,
                num_gpu: Some(num_gpu),
                num_ctx: Some(num_ctx),
                num_keep: None,
            };

            let prompt = format!(
                "Analyze the following document and write a single-sentence summary detailing the topic, author, context, and date if available.\n\nDocument text:\n\"\"\"\n{}\n\"\"\"",
                summary_input
            );

            match self.provider.generate(&prompt, &options).await {
                Ok(summary) => {
                    let cleaned = summary.trim().replace("\n", " ");
                    if !cleaned.is_empty() {
                        doc_summary = cleaned;
                        println!("RAG: Generated document summary: \"{}\"", doc_summary);
                    }
                }
                Err(e) => {
                    eprintln!("RAG WARNING: Failed to generate document summary via LLM: {}. Falling back to default.", e);
                }
            }
        }

        // Chunk text — 400-char chunks with 80-char overlap.
        // Smaller chunks: fewer tokens per chunk means the LLM evaluates
        // a shorter context, reducing time-to-first-token significantly.
        let mut chunks = chunk_text(&extracted_text, 400, 80);
        println!("RAG: Split document into {} chunks.", chunks.len());
        if chunks.is_empty() {
            let mut completed_record = doc_record.clone();
            completed_record.status = "completed".to_string();
            self.db.upsert_document(&completed_record)?;
            return Ok("completed".to_string());
        }

        // Prepend contextual summary to each chunk
        let context_header = format!("[Context: {}]\n\n", doc_summary);
        for chunk in &mut chunks {
            chunk.text = format!("{}{}", context_header, chunk.text);
        }

        // Generate embeddings — batch via Ollama (uses cache to skip already-computed chunks)
        let mut embeddings = Vec::with_capacity(chunks.len());
        let mut chunks_to_embed = Vec::new();
        let mut cache_hits = 0;

        for chunk in &chunks {
            // Stable FNV-1a hash to ensure cache is valid across compiles/platforms
            let chunk_hash = {
                let mut hash: u64 = 0xcbf29ce484222325;
                for byte in chunk.text.bytes() {
                    hash ^= byte as u64;
                    hash = hash.wrapping_mul(0x100000001b3);
                }
                format!("{:x}", hash)
            };

            if let Ok(Some(cached_vector)) = self.db.get_cached_embedding(&chunk_hash) {
                embeddings.push((chunk.index, cached_vector));
                cache_hits += 1;
            } else {
                chunks_to_embed.push((chunk.index, chunk.text.clone(), chunk_hash));
            }
        }

        if !chunks_to_embed.is_empty() {
            let texts_to_embed: Vec<String> = chunks_to_embed.iter().map(|(_, text, _)| text.clone()).collect();
            let mut batch_embeddings = Vec::new();
            let total_batches = (texts_to_embed.len() + 15) / 16;
            
            for (idx, batch) in texts_to_embed.chunks(16).enumerate() {
                println!("RAG: Generating embeddings for batch {}/{}...", idx + 1, total_batches);
                let res = self.provider.embed_batch(batch, &self.embedding_model).await?;
                batch_embeddings.extend(res);
            }

            for (i, (chunk_index, _, chunk_hash)) in chunks_to_embed.into_iter().enumerate() {
                let vector = batch_embeddings[i].clone();
                let _ = self.db.cache_embedding(&chunk_hash, &vector);
                embeddings.push((chunk_index, vector));
            }
        }

        println!("RAG: Ingested {} chunks ({} cached, {} computed)", chunks.len(), cache_hits, chunks.len() - cache_hits);

        // Sort back to structural sequence
        embeddings.sort_by_key(|(index, _)| *index);

        // Prepare vector records
        let mut vector_records = Vec::new();
        for (i, chunk) in chunks.iter().enumerate() {
            let vector = embeddings[i].1.clone();
            let payload = serde_json::json!({
                "document_id": doc_id,
                "filepath": filepath,
                "filename": file_name,
                "chunk_index": chunk.index,
                "text": chunk.text,
                "agent_id": agent_id,
            });
            vector_records.push(VectorRecord {
                id: Uuid::new_v4().to_string(),
                vector,
                payload,
            });
        }

        // Clean up previous chunks of the same file from VectorStore
        let escaped_path = filepath.replace("'", "''");
        let delete_filter = format!("filepath = '{}'", escaped_path);
        let target_collection = collection_id.as_deref().unwrap_or("default_collection");
        let _ = self.store.delete(target_collection, &delete_filter).await;

        // Insert into VectorDB
        match self.store.upsert(target_collection, &vector_records).await {
            Ok(_) => {
                // Update document status in SQLite
                let mut completed_record = doc_record.clone();
                completed_record.status = "completed".to_string();
                self.db.upsert_document(&completed_record)?;
                
                // Insert into FTS5
                for record in &vector_records {
                    if let Some(text) = record.payload.get("text").and_then(|v| v.as_str()) {
                        let _ = self.db.insert_fts_chunk(&record.id, &doc_id, text);
                    }
                }

                // GraphRAG triple extraction
                let triple_prompt_text = if extracted_text.len() > 8000 {
                    &extracted_text[..8000]
                } else {
                    &extracted_text
                };

                let prompt = format!(
                    "You are a knowledge graph builder. Extract key entities (people, concepts, locations, organizations) and their relationships from the text.\n\
                     Format your response STRICTLY as a JSON array of triples: [{{ \"subject\": \"Entity A\", \"relation\": \"relationship text\", \"object\": \"Entity B\" }}].\n\
                     Return ONLY the JSON array, do not include markdown backticks or any other text.\n\n\
                     Document content:\n\"\"\"\n{}\n\"\"\"",
                    triple_prompt_text
                );

                let options = crate::models::GenerateOptions {
                    model_name: llm_parsing_model.clone(),
                    temperature: 0.1,
                    max_tokens: Some(400),
                    system_prompt: Some("Extract key semantic triples. Return ONLY valid JSON array.".to_string()),
                    stop_sequences: Vec::new(),
                    json_mode: true,
                    num_gpu: Some(num_gpu),
                    num_ctx: Some(num_ctx),
                    num_keep: None,
                };

                println!("RAG: Extracting semantic triples for GraphRAG using model: {}", llm_parsing_model);
                if let Ok(response) = self.provider.generate(&prompt, &options).await {
                    println!("RAG: Extracted raw triples: {}", response);
                    let mut cleaned_json = response.trim().to_string();
                    if cleaned_json.starts_with("```") {
                        if let Some(start_idx) = cleaned_json.find('[') {
                            if let Some(end_idx) = cleaned_json.rfind(']') {
                                cleaned_json = cleaned_json[start_idx..=end_idx].to_string();
                            }
                        }
                    }
                    if let Ok(triples_array) = serde_json::from_str::<Vec<serde_json::Value>>(&cleaned_json) {
                        for triple in triples_array {
                            let subject = triple.get("subject").and_then(|v| v.as_str()).unwrap_or("");
                            let relation = triple.get("relation").and_then(|v| v.as_str()).unwrap_or("");
                            let object = triple.get("object").and_then(|v| v.as_str()).unwrap_or("");
                            if !subject.is_empty() && !relation.is_empty() && !object.is_empty() {
                                let _ = self.db.save_triple(&doc_id, subject, relation, object);
                            }
                        }
                        println!("RAG: Successfully saved extracted triples for document.");
                    } else {
                        eprintln!("RAG WARNING: Failed to parse triples JSON: {}", cleaned_json);
                    }
                }

                Ok("completed".to_string())
            }
            Err(e) => {
                // Update document status to failed in SQLite if vector upsert fails
                let mut failed_record = doc_record.clone();
                failed_record.status = format!("failed: {}", e);
                let _ = self.db.upsert_document(&failed_record);
                Err(e)
            }
        }
    }

    pub async fn delete_document(&self, doc_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        println!("RAG: Deleting document {}...", doc_id);
        // Delete from VectorStore
        if let Some(doc) = self.db.get_document(doc_id)? {
            let target_collection = doc.collection_id.as_deref().unwrap_or("default_collection");
            let delete_filter = format!("document_id = '{}'", doc_id);
            if let Err(e) = self.store.delete(target_collection, &delete_filter).await {
                println!("RAG Warning: Failed to delete vectors for document {}: {}", doc_id, e);
            }
        }

        // Delete from FTS5
        let _ = self.db.delete_fts_document(doc_id);
        
        // Get document filepath before marking excluded
        let all_docs = self.db.list_all_documents()?;
        let filepath = all_docs.iter()
            .find(|d| d.id == doc_id)
            .map(|d| d.filepath.clone());
        
        // If this document is in a watched sync folder, mark as "excluded" so
        // the background watcher won't re-ingest it on next scan.
        // Otherwise delete the record entirely.
        let sync_dir = self.db.get_setting("sync_directory").unwrap_or(None);
        let is_in_watched_folder = filepath.as_deref().and_then(|fp| {
            sync_dir.as_deref().map(|sd| fp.starts_with(sd))
        }).unwrap_or(false);
        
        if is_in_watched_folder {
            // Mark as excluded so watcher skips re-ingestion
            self.db.mark_document_excluded(doc_id)?;
            println!("RAG: Marked document {} as excluded (in watched folder)", doc_id);
        } else {
            // Fully delete from SQLite
            self.db.delete_document(doc_id)?;
            println!("RAG: Deleted document {} from SQLite", doc_id);
        }
        
        Ok(())
    }

    pub async fn move_document_collection(
        &self,
        doc_id: &str,
        new_collection_id: Option<&str>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let doc = match self.db.get_document(doc_id)? {
            Some(d) => d,
            None => return Ok(()),
        };

        let old_collection = doc.collection_id.as_deref().unwrap_or("default_collection");
        let target_collection = new_collection_id.unwrap_or("default_collection");

        if old_collection != target_collection {
            let delete_filter = format!("document_id = '{}'", doc_id);
            let _ = self.store.delete(old_collection, &delete_filter).await;

            if let Ok(text) = extract_text(&doc.filepath) {
                let chunks = chunk_text(&text, 750, 100);
                let mut vector_records = Vec::new();

                for chunk in &chunks {
                    let chunk_hash = {
                        let mut hash: u64 = 0xcbf29ce484222325;
                        for byte in chunk.text.bytes() {
                            hash ^= byte as u64;
                            hash = hash.wrapping_mul(0x100000001b3);
                        }
                        format!("{:x}", hash)
                    };

                    let vector = if let Ok(Some(cached_vec)) = self.db.get_cached_embedding(&chunk_hash) {
                        cached_vec
                    } else if let Ok(vec) = self.provider.embed(&chunk.text, &self.embedding_model).await {
                        let _ = self.db.cache_embedding(&chunk_hash, &vec);
                        vec
                    } else {
                        continue;
                    };

                    let chunk_id = format!("{}_{}", doc_id, chunk.index);
                    vector_records.push(crate::vector::VectorRecord {
                        id: chunk_id,
                        vector,
                        payload: serde_json::json!({
                            "text": chunk.text,
                            "document_id": doc_id,
                            "chunk_index": chunk.index,
                            "agent_id": doc.agent_id,
                        }),
                    });
                }

                if !vector_records.is_empty() {
                    let _ = self.store.initialize(target_collection).await;
                    let _ = self.store.upsert(target_collection, &vector_records).await;
                }
            }
        }

        self.db.update_document_collection(doc_id, new_collection_id)?;
        Ok(())
    }


    pub async fn clear_collection(&self, collection_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Drop vector collection
        if let Err(e) = self.store.drop_collection(collection_id).await {
            println!("RAG Warning: Failed to drop collection: {}", e);
        } else {
            println!("RAG: Dropped collection successfully.");
        }
        
        // Re-initialize
        println!("RAG: Re-initializing collection...");
        self.store.initialize(collection_id).await?;
        
        println!("RAG: Clearing documents for collection '{}' from SQLite database...", collection_id);
        self.db.clear_documents_for_collection(collection_id)?;
        
        println!("RAG: Collection '{}' cleared successfully.", collection_id);
        Ok(())
    }

    pub async fn factory_reset(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        // Drop default collection (as a best effort)
        if let Err(e) = self.store.drop_collection("default_collection").await {
            println!("RAG Warning: Failed to drop default_collection: {}", e);
        } else {
            println!("RAG: Dropped default_collection successfully.");
        }
        
        // Re-initialize
        println!("RAG: Re-initializing default_collection...");
        self.store.initialize("default_collection").await?;
        
        println!("RAG: Clearing ALL tables from SQLite database...");
        self.db.factory_reset()?;
        
        println!("RAG: Factory reset completed successfully.");
        Ok(())
    }

    pub async fn retrieve_context(
        &self,
        query_text: &str,
        limit: usize,
        category_filter: Option<String>,
        collection_ids: Vec<String>,
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error + Send + Sync>> {
        let query_vector = self.provider.embed(query_text, &self.embedding_model).await?;
        
        // Efficient category filter: push the predicate into SQLite (uses idx_docs_category index).
        // Previously this loaded ALL documents into memory on every chat message.
        let valid_doc_ids: Option<std::collections::HashSet<String>> = if let Some(cat) = category_filter {
            if cat.trim().is_empty() || cat == "Everything" {
                None
            } else {
                Some(self.db.get_doc_ids_for_category(&cat).unwrap_or_default())
            }
        } else {
            None
        };

        let search_query = SearchQuery {
            vector: query_vector,
            limit: limit * 10, // Fetch more for RRF and filtering
            filter: None, // Removed agent_id filter
        };
        let mut vector_results = Vec::new();
        let target_collections = if collection_ids.is_empty() {
            vec!["default_collection".to_string()]
        } else {
            collection_ids
        };

        for col_id in target_collections {
            if let Ok(mut res) = self.store.query(&col_id, &search_query).await {
                vector_results.append(&mut res);
            }
        }
        
        // Note: db.search_fts currently takes agent_id, we will pass None
        let mut fts_results = self.db.search_fts(query_text, limit * 10, None).unwrap_or_default();

        // Apply post-retrieval filtering
        if let Some(valid_set) = &valid_doc_ids {
            vector_results.retain(|res| {
                if let Some(doc_id) = res.record.payload.get("document_id").and_then(|v| v.as_str()) {
                    valid_set.contains(doc_id)
                } else {
                    false
                }
            });
            
            fts_results.retain(|(_, doc_id, _, _)| {
                valid_set.contains(doc_id)
            });

        }
        
        // Combine using Reciprocal Rank Fusion (RRF)
        let k = 60.0;
        let mut rrf_scores: std::collections::HashMap<String, f32> = std::collections::HashMap::new();
        
        for (rank, result) in vector_results.iter().enumerate() {
            let score = 1.0 / (k + rank as f32);
            *rrf_scores.entry(result.record.id.clone()).or_insert(0.0) += score;
        }
        
        let mut fts_map = std::collections::HashMap::new();
        for (rank, (chunk_id, doc_id, text, _fts_score)) in fts_results.into_iter().enumerate() {
            let score = 1.0 / (k + rank as f32);
            *rrf_scores.entry(chunk_id.clone()).or_insert(0.0) += score;
            fts_map.insert(chunk_id, (doc_id, text));
        }

        let mut combined_results = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        for res in vector_results {
            seen_ids.insert(res.record.id.clone());
            combined_results.push(res);
        }

        for (chunk_id, (doc_id, text)) in fts_map {
            if !seen_ids.contains(&chunk_id) {
                let record = crate::vector::VectorRecord {
                    id: chunk_id,
                    vector: Vec::new(),
                    payload: serde_json::json!({
                        "text": text,
                        "document_id": doc_id,
                    }),
                };
                combined_results.push(SearchResult {
                    record,
                    distance: 1.0,
                });
            }
        }
        
        // Sort combined_results based on RRF score (descending)
        combined_results.sort_by(|a, b| {
            let score_a = rrf_scores.get(&a.record.id).unwrap_or(&0.0);
            let score_b = rrf_scores.get(&b.record.id).unwrap_or(&0.0);
            score_b.partial_cmp(score_a).unwrap_or(std::cmp::Ordering::Equal)
        });
        
        combined_results.truncate(limit);
        Ok(combined_results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::vector::LanceDbStore;
    use crate::models::OllamaProvider;
    use std::fs::File;
    use std::io::Write;

    #[tokio::test]
    async fn test_rag_ingest_and_retrieve() {
        // Create a unique temporary directory for this test
        let temp_dir = std::env::temp_dir().join(format!("persona_test_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        // 1. Initialize SQLite Database
        let db = Arc::new(Database::new(temp_dir.clone()));
        db.init().unwrap();

        // 2. Initialize LanceDB Store
        let store = Arc::new(LanceDbStore::new(temp_dir.join("lancedb").to_string_lossy().to_string()));
        store.initialize("default_collection").await.unwrap();

        // 3. Initialize Ollama Provider pointing to local instance
        let provider: Arc<dyn crate::models::ModelProvider> = Arc::new(OllamaProvider::new("http://localhost:11434".to_string()));
        
        // 4. Set up Coordinator
        let coordinator = RagCoordinator::new(
            provider,
            store,
            db.clone(),
            "nomic-embed-text:latest".to_string(),
        );

        // Verify if Ollama is running and has the model.
        // If not, we skip the test to avoid failures on headless runners.
        let client = reqwest::Client::new();
        let res = client.get("http://localhost:11434/api/tags").send().await;
        if res.is_err() {
            println!("Skipping RAG integration test: Ollama is not running on localhost:11434");
            let _ = std::fs::remove_dir_all(temp_dir);
            return;
        }

        // 5. Test Ingestion
        let test_file = temp_dir.join("test_doc.md");
        let mut file = File::create(&test_file).unwrap();
        file.write_all(b"Hello world. This is a test document about Rust and Tauri. We are building a local AI assistant.").unwrap();
        let filepath = test_file.to_string_lossy().to_string();

        let result = coordinator.ingest_file(&filepath, None, None, true).await;
        assert!(result.is_ok(), "Ingestion failed: {:?}", result.err());

        // Check SQLite
        let docs = db.list_documents(None).unwrap();
        assert_eq!(docs.len(), 1);
        assert_eq!(docs[0].status, "completed");

        // 6. Test Retrieval
        let results = coordinator.retrieve_context("test document", 5, None, vec![]).await.unwrap();
        assert!(!results.is_empty(), "Expected retrieval results");
        assert!(results[0].record.payload.get("text").unwrap().as_str().unwrap().contains("test document"));

        // 7. Test Deletion
        coordinator.delete_document(&docs[0].id).await.unwrap();
        let docs_after = db.list_documents(None).unwrap();
        assert!(docs_after.is_empty(), "Document should be deleted from SQLite");
        
        let results_after = coordinator.retrieve_context("test document", 5, None, vec![]).await.unwrap();
        assert!(results_after.is_empty(), "Document should be deleted from VectorStore");

        // Clean up temp directory
        let _ = std::fs::remove_dir_all(temp_dir);
    }
}

