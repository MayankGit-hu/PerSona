use axum::{
    routing::{get, post, delete},
    Router,
    Json,
    extract::{State, Path, Query},
    http::{HeaderMap, StatusCode},
    response::sse::{Event, Sse},
};
use futures_util::stream::{self, Stream};
use std::convert::Infallible;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use local_ip_address::local_ip;
use uuid::Uuid;

use crate::db::Database;
use crate::rag::RagCoordinator;

use crate::skills::SkillRegistry;
use crate::agent::AgentExecutor;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub rag: Arc<RagCoordinator>,
    pub skills: Arc<SkillRegistry>,
    pub passcode: String,
}

pub struct HostServerState {
    pub handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl HostServerState {
    pub fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }
}

#[derive(Deserialize)]
pub struct ChatPayload {
    pub thread_id: String,
    pub user_message: String,
    pub model_name: String,
    pub images: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct IngestUrlPayload {
    pub url: String,
    pub agent_id: Option<String>,
}

#[derive(Serialize)]
pub struct StatusResponse {
    pub status: String,
    pub app: String,
    pub ip: String,
}

#[derive(Serialize)]
pub struct HostNetworkInfo {
    pub ip: String,
    pub passcode: String,
    pub is_running: bool,
    pub port: u16,
}

fn check_auth(headers: &HeaderMap, passcode: &str) -> Result<(), StatusCode> {
    if passcode.is_empty() {
        return Ok(());
    }
    if let Some(auth_header) = headers.get("Authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            let token = auth_str.trim_start_matches("Bearer ").trim();
            if token == passcode {
                return Ok(());
            }
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

// 1. Status Check
async fn handle_status(State(_state): State<AppState>) -> Result<Json<StatusResponse>, StatusCode> {
    let ip = local_ip().map(|ip| ip.to_string()).unwrap_or_else(|_| "127.0.0.1".to_string());
    Ok(Json(StatusResponse {
        status: "ok".to_string(),
        app: "PerSona Host Server".to_string(),
        ip,
    }))
}

// 2. Documents APIs
#[derive(Deserialize)]
pub struct ListDocsQuery {
    pub agent_id: Option<String>,
}

async fn handle_list_docs(
    State(state): State<AppState>,
    Query(query): Query<ListDocsQuery>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let docs = state.db.list_documents(query.agent_id.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!(docs)))
}

async fn handle_list_all_docs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let docs = state.db.list_all_documents()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!(docs)))
}

async fn handle_ingest_url(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<IngestUrlPayload>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    // Launch ingestion as a background task
    let rag = state.rag.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::commands::ingest_url_impl(&payload.url, payload.agent_id.clone(), None, &rag).await {
            eprintln!("REST server ingestion process failed: {}", e);
        }
    });

    Ok(StatusCode::ACCEPTED)
}

async fn handle_delete_doc(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    
    state.db.delete_document(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
    let store = state.rag.store.clone();
    tokio::spawn(async move {
        use crate::vector::VectorStore;
        let _ = store.delete("knowledge_base", &format!("document_id = '{}'", id)).await;
    });

    Ok(StatusCode::OK)
}

// 3. Discovered Skills list
async fn handle_list_skills(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let list = state.skills.list_skills()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!(list)))
}

async fn handle_delete_skill(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    state.skills.delete_skill(&name)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

// 4. SSE Chat Stream endpoint
async fn handle_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<ChatPayload>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, StatusCode> {
    check_auth(&headers, &state.passcode)?;

    let (tx, rx) = tokio::sync::mpsc::channel::<String>(100);
    
    // Save user's message
    let user_msg_id = Uuid::new_v4().to_string();
    let _ = state.db.save_message(&user_msg_id, &payload.thread_id, "user", &payload.user_message, payload.images.clone());

    // Spawn agent executor
    let provider = state.rag.provider.clone();
    let skills = state.skills.clone();
    let db = state.rag.db.clone();
    let model = payload.model_name.clone();
    let thread = payload.thread_id.clone();
    let message = payload.user_message.clone();
    let images = payload.images.clone();

    let rag = state.rag.clone();

    tokio::spawn(async move {
        // Resolve category filter: use the agent's default_category if the thread
        // has an assigned agent. This mirrors the logic in commands::send_chat_message.
        let mut actual_category = None;
        let mut collection_ids = Vec::new();
        
        if let Ok(threads) = db.list_threads() {
            if let Some(thread_record) = threads.iter().find(|t| t.id == thread) {
                if let Some(agent_id) = &thread_record.agent_id {
                    if let Ok(Some(agent_record)) = db.get_agent(agent_id) {
                        actual_category = agent_record.default_category;
                        if let Some(col_ids_json) = agent_record.collection_ids {
                            if let Ok(ids) = serde_json::from_str::<Vec<String>>(&col_ids_json) {
                                collection_ids = ids;
                            }
                        }
                    }
                }
            }
        }

        let search_results = rag.retrieve_context(&message, 5, actual_category, collection_ids).await.unwrap_or_default();
        
        let mut context_str = String::new();
        let mut citations_json_array = Vec::new();
        
        for (i, res) in search_results.iter().enumerate() {
            let text = res.record.payload.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let filepath = res.record.payload.get("filepath").and_then(|v| v.as_str()).unwrap_or("");
            context_str.push_str(&format!("Document [{}]: {}\n\n", i + 1, text));
            citations_json_array.push(serde_json::json!({
                "source_index": i + 1,
                "filename": filepath,
                "text": text,
            }));
        }

        if !citations_json_array.is_empty() {
            let citations_msg = serde_json::json!({
                "type": "citations",
                "citations": citations_json_array
            });
            let _ = tx.send(citations_msg.to_string()).await;
        }

        let agent = AgentExecutor::new(provider, skills, db.clone(), model);
        
        let tx_clone = tx.clone();
        let agent_res = agent.run_agent_loop(&thread, &message, images, &context_str, &move |msg| {
            let _ = tx_clone.blocking_send(msg);
        }).await;

        match agent_res {
            Ok(full_response) => {
                let assistant_msg_id = Uuid::new_v4().to_string();
                let _ = db.save_message(&assistant_msg_id, &thread, "assistant", &full_response, None);
                
                // Send finalized done event
                let done_json = serde_json::json!({
                    "type": "done",
                });
                let _ = tx.blocking_send(done_json.to_string());
            }
            Err(e) => {
                let error_json = serde_json::json!({
                    "type": "error",
                    "error": e.to_string(),
                });
                let _ = tx.blocking_send(error_json.to_string());
            }
        }
    });

    let sse_stream = stream::unfold(rx, |mut rx| async move {
        if let Some(msg) = rx.recv().await {
            Some((Ok(Event::default().data(msg)), rx))
        } else {
            None
        }
    });

    Ok(Sse::new(sse_stream))
}

// 5. Threads APIs
async fn handle_list_threads(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let threads = state.db.list_threads()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!(threads)))
}

async fn handle_create_thread(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let id = payload.get("id").and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = payload.get("title").and_then(|v| v.as_str()).unwrap_or("New Conversation");
    
    let thread = crate::db::ThreadRecord {
        id: id.clone(),
        title: title.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        agent_id: None,
        category_filter: None,
    };
    
    state.db.create_thread(&id, &thread.title, thread.agent_id.as_deref())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
    Ok(Json(serde_json::json!(thread)))
}

async fn handle_delete_thread(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    state.db.delete_thread(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(StatusCode::OK)
}

async fn handle_get_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let history = state.db.get_chat_history(&id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!(history)))
}

async fn handle_list_models(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<String>>, StatusCode> {
    check_auth(&headers, &state.passcode)?;
    let models = state.rag.provider.list_models().await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(models))
}

pub async fn run_server(port: u16, state: AppState) {
    let app = Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/models", get(handle_list_models))
        .route("/api/documents", get(handle_list_docs))
        .route("/api/documents/all", get(handle_list_all_docs))
        .route("/api/documents/ingest_url", post(handle_ingest_url))
        .route("/api/documents/:id", delete(handle_delete_doc))
        .route("/api/skills", get(handle_list_skills))
        .route("/api/skills/:name", delete(handle_delete_skill))
        .route("/api/chat", post(handle_chat))
        .route("/api/threads", get(handle_list_threads).post(handle_create_thread))
        .route("/api/threads/:id", delete(handle_delete_thread))
        .route("/api/threads/:id/messages", get(handle_get_history))
        .with_state(state);

    let listener = match tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind host server port: {}", e);
            return;
        }
    };
    
    println!("Host server started on http://0.0.0.0:{}", port);
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("REST host server encountered error: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn test_check_auth() {
        let mut headers = HeaderMap::new();
        
        // 1. Success with correct Bearer passcode
        headers.insert("Authorization", "Bearer my_secret_passcode".parse().unwrap());
        assert!(check_auth(&headers, "my_secret_passcode").is_ok());

        // 2. Failure with incorrect passcode
        assert_eq!(
            check_auth(&headers, "wrong_passcode").unwrap_err(),
            StatusCode::UNAUTHORIZED
        );

        // 3. Failure with missing header
        let empty_headers = HeaderMap::new();
        assert_eq!(
            check_auth(&empty_headers, "some_passcode").unwrap_err(),
            StatusCode::UNAUTHORIZED
        );

        // 4. Success when server has no passcode configured
        assert!(check_auth(&empty_headers, "").is_ok());
    }
}
