use crate::db::{Database, DocumentRecord, MessageRecord, ThreadRecord};

use crate::rag::RagCoordinator;
use crate::vector::VectorStore;
use crate::skills::{Skill, SkillRegistry};
use serde_json::Value;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RuntimeSettings {
    pub ollama_base_url: String,
    pub ollama_num_gpu: i32,
    pub ollama_num_ctx: usize,
    pub embedding_model: String,
    pub llm_parsing_enabled: bool,
    pub llm_parsing_model: String,
    pub serper_api_key: String,
    pub openai_api_key: String,
    pub anthropic_api_key: String,
}

#[tauri::command]
pub async fn ingest_file(
    filepath: String,
    agent_id: Option<String>,
    collection_id: Option<String>,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<String, String> {
    rag.ingest_file(&filepath, agent_id, collection_id, true).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ingest_folder(
    folderpath: String,
    agent_id: Option<String>,
    collection_id: Option<String>,
    rag: State<'_, Arc<RagCoordinator>>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    let mut count = 0;
    
    // First, count total files for progress
    let mut total_files = 0;
    let walker = walkdir::WalkDir::new(&folderpath).into_iter().filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            total_files += 1;
        }
    }
    
    let mut current = 0;
    let walker = walkdir::WalkDir::new(&folderpath).into_iter().filter_map(|e| e.ok());
    for entry in walker {
        if entry.file_type().is_file() {
            current += 1;
            let filename = entry.file_name().to_string_lossy().to_string();
            let path_str = entry.path().to_string_lossy().to_string();
            
            let _ = app_handle.emit("ingest-progress", serde_json::json!({
                "message": format!("Ingesting: {} ({}/{})", filename, current, total_files)
            }));
            
            // Try to ingest, ignore errors (unsupported formats)
            if rag.ingest_file(&path_str, agent_id.clone(), collection_id.clone(), true).await.is_ok() {
                count += 1;
            }
        }
    }
    Ok(count)
}

#[tauri::command]
pub fn list_documents(
    agent_id: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<DocumentRecord>, String> {
    db.list_documents(agent_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_all_documents(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<DocumentRecord>, String> {
    db.list_all_documents().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_collection(
    id: String,
    name: String,
    description: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.create_collection(&id, &name, &description).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_collections(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::db::CollectionRecord>, String> {
    db.list_collections().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_collection(
    id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Option<crate::db::CollectionRecord>, String> {
    db.get_collection(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_collection(
    id: String,
    name: String,
    description: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_collection(&id, &name, &description).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_collection(
    id: String,
    rag: State<'_, Arc<RagCoordinator>>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    // 1. Drop the vector store collection (best effort)
    if let Err(e) = rag.store.drop_collection(&id).await {
        println!("RAG Warning: Failed to drop vector collection '{}': {}", id, e);
    }
    // 2. Disassociate documents (set collection_id = NULL so they remain accessible)
    db.disassociate_documents_from_collection(&id).map_err(|e| e.to_string())?;
    // 3. Delete the collection record from SQLite
    db.delete_collection(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_graph_triples(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::db::TripleRecord>, String> {
    db.list_triples().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_document(
    id: String,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<(), String> {
    rag.delete_document(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_collection(
    collection_id: String,
    rag: State<'_, Arc<RagCoordinator>>,
    watcher: State<'_, Arc<crate::sync::FolderWatcher>>,
) -> Result<(), String> {
    // Stop the watcher first so it doesn't re-ingest files immediately
    watcher.stop_watching().await;
    rag.clear_collection(&collection_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn log_frontend(msg: String) {
    println!("FRONTEND LOG: {}", msg);
}

#[tauri::command]
pub async fn factory_reset(
    rag: State<'_, Arc<RagCoordinator>>,
    watcher: State<'_, Arc<crate::sync::FolderWatcher>>,
) -> Result<(), String> {
    println!("COMMAND: factory_reset called from frontend!");
    // Stop the watcher first
    watcher.stop_watching().await;
    println!("COMMAND: watcher stopped, calling rag.factory_reset()...");
    rag.factory_reset().await.map_err(|e| {
        println!("COMMAND: rag.factory_reset() failed: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub fn update_document_category(
    id: String,
    category: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_document_category(&id, &category).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_document_collection(
    id: String,
    collection_id: Option<String>,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<(), String> {
    rag.move_document_collection(&id, collection_id.as_deref()).await.map_err(|e| e.to_string())
}


#[tauri::command]
pub fn create_chat_thread(
    id: String,
    title: String,
    agent_id: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.create_thread(&id, &title, agent_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_thread(
    id: String,
    title: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.update_thread_title(&id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_chat_thread(
    thread_id: String,
    format: String,
    filepath: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    let history = db.get_chat_history(&thread_id).map_err(|e| e.to_string())?;

    let content = if format.to_lowercase() == "json" {
        serde_json::to_string_pretty(&history).map_err(|e| e.to_string())?
    } else {
        // Markdown
        let mut md = String::new();
        md.push_str("# Chat Export\n\n---\n\n");
        for msg in history {
            let role_display = if msg.role == "user" { "User" } else { "PerSona" };
            md.push_str(&format!("**{}**: {}\n\n---\n\n", role_display, msg.content));
        }
        md
    };

    std::fs::write(&filepath, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn set_thread_category(
    id: String,
    category: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.set_thread_category_filter(&id, category.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_agent(
    id: String,
    name: String,
    description: String,
    system_prompt: String,
    skills: Vec<String>,
    default_category: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    let agent = crate::db::AgentRecord {
        id: id.clone(),
        name,
        description,
        system_prompt,
        skills: serde_json::to_string(&skills).unwrap_or_else(|_| "[]".to_string()),
        default_category,
        collection_ids: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    db.create_agent(&agent).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_agents(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<crate::db::AgentRecord>, String> {
    db.list_agents().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_agent(
    id: String,
    name: String,
    description: String,
    system_prompt: String,
    skills: Vec<String>,
    default_category: Option<String>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    // We need to fetch the existing agent to keep its created_at and collection_ids
    let existing_agent = db.get_agent(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Agent not found".to_string())?;

    let agent = crate::db::AgentRecord {
        id: id.clone(),
        name,
        description,
        system_prompt,
        skills: serde_json::to_string(&skills).unwrap_or_else(|_| "[]".to_string()),
        default_category,
        collection_ids: existing_agent.collection_ids,
        created_at: existing_agent.created_at,
    };
    db.update_agent(&agent).map_err(|e| e.to_string())
}


#[tauri::command]
pub fn get_document_text(document_id: String, db: State<'_, Arc<Database>>) -> Result<String, String> {
    db.get_document_text(&document_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_agent(
    id: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_agent(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_chat_threads(
    db: State<'_, Arc<Database>>,
) -> Result<Vec<ThreadRecord>, String> {
    db.list_threads().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_chat_thread(
    id: String,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.delete_thread(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chat_history(
    thread_id: String,
    db: State<'_, Arc<Database>>,
) -> Result<Vec<MessageRecord>, String> {
    db.get_chat_history(&thread_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_chat_message(
    thread_id: String,
    user_message: String,
    images: Option<Vec<String>>,
    model_name: String,
    category_filter: Option<String>,
    mentioned_document_ids: Option<Vec<String>>,
    on_chunk: Channel<String>,
    rag: State<'_, Arc<RagCoordinator>>,
    skills: State<'_, Arc<SkillRegistry>>,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    use crate::agent::AgentExecutor;

    // Load runtime settings for GPU/ctx pass-through
    let num_gpu: Option<i32> = db.get_setting("ollama_num_gpu")
        .ok().flatten()
        .and_then(|s| s.parse().ok())
        .map(|v: i32| if v == -1 { -1 } else { v });
    let num_ctx: Option<usize> = db.get_setting("ollama_num_ctx")
        .ok().flatten()
        .and_then(|s| s.parse().ok());

    let agent = AgentExecutor::new(
        rag.provider.clone(),
        skills.inner().clone(),
        rag.db.clone(),
        model_name,
    ).with_runtime_settings(num_gpu, num_ctx);

    // Persist the user message BEFORE running the agent loop so that
    // loadChatHistory() on the frontend always returns a complete thread.
    let user_msg_id = Uuid::new_v4().to_string();
    db.save_message(&user_msg_id, &thread_id, "user", &user_message, images.clone())
        .map_err(|e| e.to_string())?;

    let mut actual_category = category_filter.filter(|s| !s.trim().is_empty());
    let mut collection_ids = Vec::new();

    if let Ok(threads) = db.list_threads() {
        if let Some(thread) = threads.iter().find(|t| t.id == thread_id) {
            if actual_category.is_none() {
                if let Some(cat) = &thread.category_filter {
                    actual_category = Some(cat.clone());
                }
            }
            if let Some(agent_id) = &thread.agent_id {
                if let Ok(Some(agent_record)) = db.get_agent(agent_id) {
                    if actual_category.is_none() {
                        actual_category = agent_record.default_category;
                    }
                    if let Some(col_ids_json) = agent_record.collection_ids {
                        if let Ok(ids) = serde_json::from_str::<Vec<String>>(&col_ids_json) {
                            collection_ids = ids;
                        }
                    }
                }
            }
        }
    }

    // Retrieve RAG Context — 3 chunks keeps the prompt tight for faster LLM evaluation.
    // The internal over-fetch (limit * 10) inside retrieve_context ensures quality isn't lost.
    let search_results = rag.retrieve_context(&user_message, 3, actual_category, collection_ids).await.unwrap_or_default();
    
    let mut context_str = String::new();
    let mut citations_json_array = Vec::new();
    let mut citation_idx = 1;
    
    for res in search_results.iter() {
        let text = res.record.payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
        let filepath = res.record.payload.get("filepath").and_then(|v| v.as_str()).unwrap_or("");
        let document_id = res.record.payload.get("document_id").and_then(|v| v.as_str()).unwrap_or("");
        context_str.push_str(&format!("Document [{}]: {}\n\n", citation_idx, text));
        citations_json_array.push(serde_json::json!({
            "source_index": citation_idx,
            "filename": filepath, // kept for backwards compatibility
            "filepath": filepath,
            "document_id": document_id,
            "text": text,
        }));
        citation_idx += 1;
    }

    // Retrieve and inject mentioned documents
    for doc_id in mentioned_document_ids.unwrap_or_default() {
        if let Ok(text) = db.get_document_text(&doc_id) {
            if let Ok(Some(doc)) = db.get_document(&doc_id) {
                context_str.push_str(&format!("Mentioned Document [{}]: {}\n\n", citation_idx, text));
                citations_json_array.push(serde_json::json!({
                    "source_index": citation_idx,
                    "filename": doc.filepath,
                    "filepath": doc.filepath,
                    "document_id": doc.id,
                    "text": text,
                }));
                citation_idx += 1;
            }
        }
    }

    // Traverse knowledge graph by scanning query words against entity names
    let mut graph_facts = Vec::new();
    if let Ok(all_triples) = db.list_triples() {
        let user_msg_lower = user_message.to_lowercase();
        let mut added_triples = std::collections::HashSet::new();
        
        // Match 1: Triples from the retrieved documents
        let retrieved_doc_ids: std::collections::HashSet<String> = search_results.iter()
            .filter_map(|res| res.record.payload.get("document_id").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect();
            
        for triple in &all_triples {
            if retrieved_doc_ids.contains(&triple.document_id) {
                let key = format!("{}-{}-{}", triple.subject, triple.relation, triple.object);
                if !added_triples.contains(&key) {
                    added_triples.insert(key);
                    graph_facts.push(triple.clone());
                }
            }
        }
        
        // Match 2: Entity overlap matching (entity name found in query)
        for triple in &all_triples {
            let sub_lower = triple.subject.to_lowercase();
            let obj_lower = triple.object.to_lowercase();
            // simple check: if query contains the entity as a word
            if (user_msg_lower.contains(&sub_lower) && sub_lower.len() > 2) || 
               (user_msg_lower.contains(&obj_lower) && obj_lower.len() > 2) {
                let key = format!("{}-{}-{}", triple.subject, triple.relation, triple.object);
                if !added_triples.contains(&key) {
                    added_triples.insert(key);
                    graph_facts.push(triple.clone());
                }
            }
        }
    }

    if !graph_facts.is_empty() {
        context_str.push_str("Extracted Semantic Relationships (Knowledge Graph):\n");
        for fact in graph_facts {
            context_str.push_str(&format!("- {} —({})→ {}\n", fact.subject, fact.relation, fact.object));
        }
        context_str.push_str("\n");
    }

    if !citations_json_array.is_empty() {
        let citations_msg = serde_json::json!({
            "type": "citations",
            "citations": citations_json_array
        });
        let _ = on_chunk.send(citations_msg.to_string());
    }

    let agent_res = agent.run_agent_loop(&thread_id, &user_message, images, &context_str, &|msg| {
        let _ = on_chunk.send(msg);
    }).await;
    match agent_res {
        Ok(full_response) => {
            let assistant_msg_id = Uuid::new_v4().to_string();
            rag.db.save_message(&assistant_msg_id, &thread_id, "assistant", &full_response, None)
                .map_err(|e| e.to_string())?;
            
            // Send completion message
            let done_json = serde_json::json!({
                "type": "done",
            });
            let _ = on_chunk.send(done_json.to_string());
            
            Ok(())
        }
        Err(e) => {
            println!("Agent execution failed in send_chat_message: {}", e);
            let error_json = serde_json::json!({
                "type": "error",
                "error": format!("Agent execution failed: {}", e),
            });
            let _ = on_chunk.send(error_json.to_string());
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub async fn get_all_chunks(
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<Vec<crate::vector::VectorRecord>, String> {
    rag.store.get_all("knowledge_base").await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_chunk(
    chunk_id: String,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<(), String> {
    rag.store.delete("knowledge_base", &format!("id = '{}'", chunk_id)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_chunk(
    chunk_id: String,
    document_id: String,
    text: String,
    chunk_index: usize,
    agent_id: Option<String>,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<(), String> {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    let chunk_hash = format!("{:x}", hasher.finish());

    let vector = if let Ok(Some(cached_vector)) = rag.db.get_cached_embedding(&chunk_hash) {
        cached_vector
    } else {
        let res = rag.provider.embed(&text, &rag.embedding_model).await.map_err(|e| e.to_string())?;
        let _ = rag.db.cache_embedding(&chunk_hash, &res);
        res
    };

    rag.store.delete("knowledge_base", &format!("id = '{}'", chunk_id)).await.map_err(|e| e.to_string())?;

    let payload = serde_json::json!({
        "document_id": document_id,
        "chunk_index": chunk_index,
        "text": text,
        "agent_id": agent_id,
    });
    
    let record = crate::vector::VectorRecord {
        id: chunk_id,
        vector,
        payload,
    };

    rag.store.upsert("knowledge_base", &[record]).await.map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn find_similar_chunks(
    chunk_text: String,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<Vec<crate::vector::SearchResult>, String> {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    chunk_text.hash(&mut hasher);
    let chunk_hash = format!("{:x}", hasher.finish());

    let vector = if let Ok(Some(cached_vector)) = rag.db.get_cached_embedding(&chunk_hash) {
        cached_vector
    } else {
        let res = rag.provider.embed(&chunk_text, &rag.embedding_model).await.map_err(|e| e.to_string())?;
        let _ = rag.db.cache_embedding(&chunk_hash, &res);
        res
    };

    let query = crate::vector::SearchQuery {
        vector,
        limit: 6,
        filter: None,
    };

    rag.store.query("knowledge_base", &query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_file(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app_handle.run_on_main_thread(move || {
        let file = rfd::FileDialog::new()
            .add_filter("Documents", &["txt", "md", "pdf", "docx", "xlsx", "json"])
            .pick_file();
        let path = file.map(|f| f.to_string_lossy().to_string());
        let _ = tx.send(path);
    }).map_err(|e| e.to_string())?;
    
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_files(app_handle: tauri::AppHandle) -> Result<Option<Vec<String>>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app_handle.run_on_main_thread(move || {
        let files = rfd::FileDialog::new()
            .add_filter("Documents", &["txt", "md", "pdf", "docx", "xlsx", "json", "csv"])
            .pick_files();
        let paths = files.map(|fs| fs.into_iter().map(|f| f.to_string_lossy().to_string()).collect());
        let _ = tx.send(paths);
    }).map_err(|e| e.to_string())?;
    
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app_handle.run_on_main_thread(move || {
        let folder = rfd::FileDialog::new()
            .pick_folder();
        let path = folder.map(|f| f.to_string_lossy().to_string());
        let _ = tx.send(path);
    }).map_err(|e| e.to_string())?;
    
    rx.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sync_directory(
    db: State<'_, Arc<Database>>,
) -> Result<Option<String>, String> {
    db.get_setting("sync_directory").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_sync_directory(
    directory: String,
    db: State<'_, Arc<Database>>,
    watcher: State<'_, Arc<crate::sync::FolderWatcher>>,
) -> Result<(), String> {
    db.set_setting("sync_directory", &directory).map_err(|e| e.to_string())?;
    watcher.start_watching(directory).await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn ingest_url_impl(
    url: &str,
    agent_id: Option<String>,
    collection_id: Option<String>,
    rag: &RagCoordinator,
) -> Result<(), String> {
    let text = crate::parser::extract_text_from_url(url).await.map_err(|e| e.to_string())?;
    
    if text.trim().is_empty() {
        return Err("Webpage has no readable text content".to_string());
    }

    let doc_id = Uuid::new_v4().to_string();
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    let file_hash = format!("{:x}", hasher.finish());

    let doc_record = DocumentRecord {
        id: doc_id.clone(),
        filepath: url.to_string(),
        file_hash,
        file_size: text.len() as i64,
        status: "processing".to_string(),
        ingested_at: chrono::Utc::now().to_rfc3339(),
        agent_id: agent_id.clone(),
        category: None,
        collection_id: collection_id.clone(),
    };
    rag.db.upsert_document(&doc_record).map_err(|e| e.to_string())?;

    let chunks = crate::chunker::chunk_text(&text, 750, 100);
    if chunks.is_empty() {
        let mut completed_record = doc_record.clone();
        completed_record.status = "completed".to_string();
        rag.db.upsert_document(&completed_record).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut embeddings = Vec::with_capacity(chunks.len());
    let mut chunks_to_embed = Vec::new();
    
    for chunk in &chunks {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        chunk.text.hash(&mut hasher);
        let chunk_hash = format!("{:x}", hasher.finish());
        
        if let Ok(Some(cached_vector)) = rag.db.get_cached_embedding(&chunk_hash) {
            embeddings.push((chunk.index, cached_vector));
        } else {
            chunks_to_embed.push((chunk.index, chunk.text.clone(), chunk_hash));
        }
    }
    
    if !chunks_to_embed.is_empty() {
        let texts_to_embed: Vec<String> = chunks_to_embed.iter().map(|(_, text, _)| text.clone()).collect();
        let mut batch_embeddings = Vec::new();
        for batch in texts_to_embed.chunks(16) {
            let res = rag.provider.embed_batch(batch, &rag.embedding_model).await.map_err(|e| e.to_string())?;
            batch_embeddings.extend(res);
        }
        for (i, (chunk_index, _, chunk_hash)) in chunks_to_embed.into_iter().enumerate() {
            let vector = batch_embeddings[i].clone();
            let _ = rag.db.cache_embedding(&chunk_hash, &vector);
            embeddings.push((chunk_index, vector));
        }
    }
    
    embeddings.sort_by_key(|(index, _)| *index);
    
    let mut vector_records = Vec::new();
    for (i, chunk) in chunks.iter().enumerate() {
        let vector = embeddings[i].1.clone();
        let payload = serde_json::json!({
            "document_id": doc_id,
            "filepath": url,
            "filename": url,
            "chunk_index": chunk.index,
            "text": chunk.text,
            "agent_id": agent_id.clone(),
        });
        vector_records.push(crate::vector::VectorRecord {
            id: Uuid::new_v4().to_string(),
            vector,
            payload,
        });
    }
    
    let target_collection = collection_id.as_deref().unwrap_or("default_collection");
    let _ = rag.store.delete(target_collection, &format!("document_id = '{}'", doc_id)).await;
    rag.store.upsert(target_collection, &vector_records).await.map_err(|e| e.to_string())?;
    
    let mut completed_record = doc_record.clone();
    completed_record.status = "completed".to_string();
    rag.db.upsert_document(&completed_record).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn ingest_url(
    url: String,
    agent_id: Option<String>,
    collection_id: Option<String>,
    rag: State<'_, Arc<RagCoordinator>>,
) -> Result<(), String> {
    ingest_url_impl(&url, agent_id, collection_id, &rag).await
}

#[tauri::command]
pub fn list_skills(
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<Vec<Skill>, String> {
    skills.list_skills().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_skill(
    name: String,
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<(), String> {
    skills.delete_skill(&name)
}

#[tauri::command]
pub async fn execute_skill(
    name: String,
    args: Value,
    skills: State<'_, Arc<SkillRegistry>>,
    db: State<'_, Arc<Database>>,
) -> Result<String, String> {
    skills.execute_skill(&name, &args, db.inner().clone()).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn synthesize_skill(
    name: String,
    description: String,
    input_schema: Value,
    code: String,
    language: String,
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<(), String> {
    skills.save_skill(&name, &description, &input_schema, &code, &language)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_host_network_info(
    db: State<'_, Arc<Database>>,
    server_state: State<'_, Arc<crate::server::HostServerState>>,
) -> Result<crate::server::HostNetworkInfo, String> {
    use local_ip_address::local_ip;
    let ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    
    let passcode = match db.get_setting("api_passcode") {
        Ok(Some(code)) => code,
        _ => {
            let new_code = uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("persona").to_string();
            let _ = db.set_setting("api_passcode", &new_code);
            new_code
        }
    };

    let is_running = {
        let handle_guard = server_state.handle.lock().await;
        handle_guard.is_some()
    };

    Ok(crate::server::HostNetworkInfo {
        ip,
        passcode,
        is_running,
        port: 11430,
    })
}

#[tauri::command]
pub async fn toggle_host_server(
    active: bool,
    db: State<'_, Arc<Database>>,
    rag: State<'_, Arc<RagCoordinator>>,
    skills: State<'_, Arc<SkillRegistry>>,
    server_state: State<'_, Arc<crate::server::HostServerState>>,
) -> Result<(), String> {
    let mut handle_guard = server_state.handle.lock().await;

    if active {
        if handle_guard.is_some() {
            return Ok(()); // Already running
        }

        let passcode = match db.get_setting("api_passcode") {
            Ok(Some(code)) => code,
            _ => {
                let new_code = uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("persona").to_string();
                let _ = db.set_setting("api_passcode", &new_code);
                new_code
            }
        };

        let app_state = crate::server::AppState {
            db: rag.db.clone(),
            rag: rag.inner().clone(),
            skills: skills.inner().clone(),
            passcode,
        };

        let port = 11430;
        let join_handle = tokio::spawn(async move {
            crate::server::run_server(port, app_state).await;
        });

        *handle_guard = Some(join_handle);
    } else {
        if let Some(handle) = handle_guard.take() {
            handle.abort();
            println!("Host server stopped.");
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn list_local_models(rag: State<'_, Arc<RagCoordinator>>) -> Result<Vec<String>, String> {
    rag.provider.list_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_runtime_settings(
    db: State<'_, Arc<Database>>,
) -> Result<RuntimeSettings, String> {
    let base_url = db.get_setting("ollama_base_url")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "http://localhost:11434".to_string());
    let num_gpu = db.get_setting("ollama_num_gpu")
        .map_err(|e| e.to_string())?
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(-1);
    let num_ctx = db.get_setting("ollama_num_ctx")
        .map_err(|e| e.to_string())?
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(4096);
    let embedding_model = db.get_setting("embedding_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "nomic-embed-text:latest".to_string());
    let llm_parsing_enabled = db.get_setting("llm_parsing_enabled")
        .map_err(|e| e.to_string())?
        .map(|s| s == "true")
        .unwrap_or(false);
    let llm_parsing_model = db.get_setting("llm_parsing_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "llama3.2:latest".to_string());
    let serper_api_key = db.get_setting("serper_api_key")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let openai_api_key = db.get_setting("openai_api_key")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    let anthropic_api_key = db.get_setting("anthropic_api_key")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    Ok(RuntimeSettings {
        ollama_base_url: base_url,
        ollama_num_gpu: num_gpu,
        ollama_num_ctx: num_ctx,
        embedding_model,
        llm_parsing_enabled,
        llm_parsing_model,
        serper_api_key,
        openai_api_key,
        anthropic_api_key,
    })
}

#[tauri::command]
pub fn save_runtime_settings(
    settings: RuntimeSettings,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    db.set_setting("ollama_base_url", &settings.ollama_base_url).map_err(|e| e.to_string())?;
    db.set_setting("ollama_num_gpu", &settings.ollama_num_gpu.to_string()).map_err(|e| e.to_string())?;
    db.set_setting("ollama_num_ctx", &settings.ollama_num_ctx.to_string()).map_err(|e| e.to_string())?;
    db.set_setting("embedding_model", &settings.embedding_model).map_err(|e| e.to_string())?;
    db.set_setting("llm_parsing_enabled", &settings.llm_parsing_enabled.to_string()).map_err(|e| e.to_string())?;
    db.set_setting("llm_parsing_model", &settings.llm_parsing_model).map_err(|e| e.to_string())?;
    db.set_setting("serper_api_key", &settings.serper_api_key).map_err(|e| e.to_string())?;
    db.set_setting("openai_api_key", &settings.openai_api_key).map_err(|e| e.to_string())?;
    db.set_setting("anthropic_api_key", &settings.anthropic_api_key).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn approve_skill(
    skill_name: String,
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<(), String> {
    let skill_dir = skills.inner().get_skills_dir().join(&skill_name);
    let tool_path = skill_dir.join("tool.json");
    let handler_path = skill_dir.join("handler.js");
    
    if !tool_path.exists() {
        return Err(format!("Skill '{}' not found", skill_name));
    }

    if handler_path.exists() {
        let mut cmd = std::process::Command::new("node");
        cmd.arg("--check").arg(&handler_path);
        match cmd.output() {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8(output.stderr).unwrap_or_default();
                    return Err(format!("JavaScript syntax check failed:\n{}", stderr));
                }
            }
            Err(e) => {
                if e.kind() != std::io::ErrorKind::NotFound {
                    return Err(format!("Failed to run JavaScript syntax validator: {}", e));
                }
            }
        }
    }
    
    let raw = std::fs::read_to_string(&tool_path).map_err(|e| e.to_string())?;
    let mut tool: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    
    if let Some(obj) = tool.as_object_mut() {
        obj.insert("approved".to_string(), serde_json::Value::Bool(true));
    }
    
    let file = std::fs::File::create(&tool_path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, &tool).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[derive(serde::Serialize)]
pub struct SkillFiles {
    pub tool_json: String,
    pub handler_js: String,
}

#[tauri::command]
pub fn get_skill_files(
    skill_name: String,
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<SkillFiles, String> {
    let skill_dir = skills.inner().get_skills_dir().join(&skill_name);
    let tool_path = skill_dir.join("tool.json");
    let handler_path = skill_dir.join("handler.js");
    
    if !tool_path.exists() {
        return Err(format!("Skill '{}' not found", skill_name));
    }
    
    let tool_json = std::fs::read_to_string(&tool_path).unwrap_or_default();
    let handler_js = std::fs::read_to_string(&handler_path).unwrap_or_default();
    
    Ok(SkillFiles {
        tool_json,
        handler_js,
    })
}

#[tauri::command]
pub fn save_skill_files(
    skill_name: String,
    tool_json: String,
    handler_js: String,
    skills: State<'_, Arc<SkillRegistry>>,
) -> Result<(), String> {
    let skill_dir = skills.inner().get_skills_dir().join(&skill_name);
    let tool_path = skill_dir.join("tool.json");
    let handler_path = skill_dir.join("handler.js");
    
    // Quick validation of the JSON
    if let Err(e) = serde_json::from_str::<serde_json::Value>(&tool_json) {
        return Err(format!("Invalid JSON in tool.json: {}", e));
    }
    
    std::fs::write(&tool_path, tool_json).map_err(|e| e.to_string())?;
    
    if !handler_js.is_empty() {
        std::fs::write(&handler_path, handler_js).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn check_ollama_status(rag: State<'_, Arc<RagCoordinator>>) -> Result<bool, String> {
    match rag.provider.list_models().await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[derive(Clone, serde::Serialize)]
pub struct PullProgress {
    pub status: String,
    pub digest: Option<String>,
    pub total: Option<u64>,
    pub completed: Option<u64>,
}

#[tauri::command]
pub async fn pull_model(
    model_name: String,
    app: AppHandle,
    db: State<'_, Arc<Database>>,
) -> Result<(), String> {
    let base_url = db.get_setting("ollama_base_url")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "http://localhost:11434".to_string());
        
    let url = format!("{}/api/pull", base_url);
    
    let client = reqwest::Client::new();
    let mut resp = client.post(&url)
        .json(&serde_json::json!({ "name": model_name }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    if !resp.status().is_success() {
        return Err(format!("Failed to pull model: HTTP {}", resp.status()));
    }
    
    

    while let Some(chunk) = resp.chunk().await.map_err(|e| e.to_string())? {
        let chunk_str = String::from_utf8_lossy(&chunk);
        for line in chunk_str.lines() {
            if line.trim().is_empty() { continue; }
            if let Ok(parsed) = serde_json::from_str::<Value>(line) {
                let status = parsed.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let digest = parsed.get("digest").and_then(|v| v.as_str()).map(|s| s.to_string());
                let total = parsed.get("total").and_then(|v| v.as_u64());
                let completed = parsed.get("completed").and_then(|v| v.as_u64());
                
                let _ = app.emit("model-pull-progress", PullProgress {
                    status,
                    digest,
                    total,
                    completed,
                });
            }
        }
    }
    
    Ok(())
}
