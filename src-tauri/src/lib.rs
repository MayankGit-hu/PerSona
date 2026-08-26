#![recursion_limit = "512"]

mod parser;
mod chunker;
mod models;
mod vector;
mod db;
mod rag;
mod commands;
mod sync;
mod skills;
mod agent;
mod server;
mod providers_openai;
mod providers_anthropic;
mod router_provider;
use std::sync::Arc;
use tauri::Manager;
use crate::db::Database;
use crate::vector::{LanceDbStore, VectorStore};
use crate::rag::RagCoordinator;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState, Code, Modifiers};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 1. Retrieve standard app data directory from Tauri path resolver
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to locate Tauri application data directory");
            std::fs::create_dir_all(&app_data_dir)?;

            // Register Global Shortcut (Option+Space / Alt+Space)
            let shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
            let _ = app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        if is_visible {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit("window-shown", ());
                        }
                    }
                }
            });

            // 2. Initialize SQLite Database
            let db = Arc::new(Database::new(app_data_dir.clone()));
            db.init().expect("Failed to initialize SQLite database");

            // Initialize Skills Registry
            let skills_registry = Arc::new(skills::SkillRegistry::new(app_data_dir.clone()));

            // 3. Initialize LanceDB Vector Store directory
            let lancedb_dir = app_data_dir.join("lancedb");
            let store = Arc::new(LanceDbStore::new(lancedb_dir.to_string_lossy().to_string()));
            
            // Initialize vector collection "knowledge_base" synchronously during startup
            tauri::async_runtime::block_on(async {
                if let Err(e) = store.initialize("knowledge_base").await {
                    eprintln!("Warning: Failed to initialize LanceDB vector store collection: {}", e);
                }
            });

            // 4. Set up Router Model Provider & RAG Coordinator
            // We use nomic-embed-text:latest for embeddings in our local pipeline
            let provider = Arc::new(crate::router_provider::RouterProvider::new(db.clone()));
            let rag = Arc::new(RagCoordinator::new(
                provider.clone(),
                store.clone(),
                db.clone(),
                "nomic-embed-text:latest".to_string(),
            ));

            // Initialize background directory watcher
            let watcher = Arc::new(sync::FolderWatcher::new(rag.clone(), app.handle().clone()));
            
            // Restore previous directory watch if saved
            if let Ok(Some(saved_dir)) = db.get_setting("sync_directory") {
                println!("Startup: Resuming background watch for folder: {}", saved_dir);
                let watcher_clone = watcher.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = watcher_clone.start_watching(saved_dir).await {
                        eprintln!("Startup watcher sync failed: {}", e);
                    }
                });
            }

            // Initialize server state
            let server_state = Arc::new(server::HostServerState::new());

            // 5. Register shared application states
            app.manage(db);
            app.manage(rag);
            app.manage(watcher);
            app.manage(skills_registry);
            app.manage(server_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ingest_file,
            commands::ingest_folder,
            commands::list_documents,
            commands::list_all_documents,
            commands::list_graph_triples,
            commands::delete_document,
            commands::create_chat_thread,
            commands::list_chat_threads,
            commands::delete_chat_thread,
            commands::rename_thread,
            commands::set_thread_category,
            commands::get_document_text,
            commands::get_chat_history,
            commands::send_chat_message,
            commands::select_file,
            commands::select_files,
            commands::select_directory,
            commands::get_sync_directory,
            commands::set_sync_directory,
            commands::ingest_url,
            commands::list_skills,
            commands::delete_skill,
            commands::execute_skill,
            commands::synthesize_skill,
            commands::get_host_network_info,
            commands::toggle_host_server,
            commands::list_local_models,
            commands::get_runtime_settings,
            commands::save_runtime_settings,
            commands::get_skill_files,
            commands::save_skill_files,
            commands::approve_skill,
            commands::check_ollama_status,
            commands::pull_model,
            commands::create_agent,
            commands::list_agents,
            commands::update_agent,
            commands::delete_agent,
            commands::get_all_chunks,
            commands::delete_chunk,
            commands::update_chunk,
            commands::find_similar_chunks,
            commands::update_document_category,
            commands::update_document_collection,
            commands::factory_reset,
            commands::log_frontend,
            commands::export_chat_thread,
            commands::create_collection,
            commands::list_collections,
            commands::get_collection,
            commands::update_collection,
            commands::delete_collection,
            commands::clear_collection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
