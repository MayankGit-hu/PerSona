use crate::rag::RagCoordinator;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use tokio::sync::mpsc::unbounded_channel;
use std::sync::Arc;
use tokio::sync::Mutex;

use tauri::{AppHandle, Emitter};

/// Maximum number of files ingested concurrently during a folder sync.
/// Prevents Ollama from being overwhelmed on low-end machines.
const SYNC_CONCURRENCY: usize = 4;

pub struct FolderWatcher {
    coordinator: Arc<RagCoordinator>,
    current_watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
    app: AppHandle,
}

impl FolderWatcher {
    pub fn new(coordinator: Arc<RagCoordinator>, app: AppHandle) -> Self {
        Self {
            coordinator,
            current_watcher: Arc::new(Mutex::new(None)),
            app,
        }
    }

    pub async fn start_watching(&self, dir_path: String) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let path = PathBuf::from(&dir_path);
        if !path.exists() || !path.is_dir() {
            return Err("Path does not exist or is not a directory".into());
        }

        let mut guard = self.current_watcher.lock().await;
        if let Some(mut old_watcher) = guard.take() {
            let _ = old_watcher.unwatch(&path);
        }

        // 1. Perform initial sync in a background task
        let coordinator_clone = self.coordinator.clone();
        let path_clone = path.clone();
        let app_clone = self.app.clone();
        tokio::spawn(async move {
            if let Err(e) = sync_directory_contents(&coordinator_clone, &path_clone, &app_clone).await {
                eprintln!("FolderWatcher initial sync error: {}", e);
            }
        });

        // 2. Setup the recommended notifier watcher
        let (tx, mut rx) = unbounded_channel();
        let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
            if let Ok(event) = res {
                let _ = tx.send(event);
            }
        })?;

        watcher.watch(&path, RecursiveMode::Recursive)?;
        *guard = Some(watcher);

        // 3. Process notifications asynchronously in a background loop
        let coordinator = self.coordinator.clone();
        
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for p in event.paths {
                            if should_index_file(&p) {
                                let filepath = p.to_string_lossy().to_string();
                                println!("FolderWatcher: File change detected: {}", filepath);
                                if let Err(e) = coordinator.ingest_file(&filepath, None, None, false).await {
                                    eprintln!("FolderWatcher: Failed to ingest {}: {}", filepath, e);
                                }
                            }
                        }
                    }
                    EventKind::Remove(_) => {
                        for p in event.paths {
                            let filepath = p.to_string_lossy().to_string();
                            println!("FolderWatcher: File removal detected: {}", filepath);
                            if let Ok(docs) = coordinator.db.list_documents(None) {
                                if let Some(doc) = docs.iter().find(|d| d.filepath == filepath) {
                                    if let Err(e) = coordinator.delete_document(&doc.id).await {
                                        eprintln!("FolderWatcher: Failed to remove index for {}: {}", filepath, e);
                                    }
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub async fn stop_watching(&self) {
        let mut guard = self.current_watcher.lock().await;
        if let Some(watcher) = guard.take() {
            // Dropping the watcher stops it
            drop(watcher);
            println!("FolderWatcher: Stopped watching.");
        }
    }
}

fn should_index_file(path: &Path) -> bool {
    if path.is_dir() {
        return false;
    }
    
    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
        if name.starts_with('.') {
            return false;
        }
    }

    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        match ext.to_lowercase().as_str() {
            "txt" | "md" | "markdown" | "html" | "htm" | "pdf" | "docx" | "xlsx" | "json" => true,
            _ => false,
        }
    } else {
        false
    }
}

#[derive(Clone, serde::Serialize)]
pub struct SyncProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
}

async fn sync_directory_contents(coordinator: &RagCoordinator, dir: &Path, app: &AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    println!("FolderWatcher: Performing initial sync for {:?}", dir);
    
    let mut files_to_sync = Vec::new();
    collect_files_recursively(dir, &mut files_to_sync)?;

    let registered_docs = coordinator.db.list_documents(None)?;
    let mut current_filepaths = std::collections::HashSet::new();

    let total = files_to_sync.len();

    // Process files in batches of SYNC_CONCURRENCY to avoid overwhelming Ollama
    for batch_start in (0..total).step_by(SYNC_CONCURRENCY) {
        let batch_end = (batch_start + SYNC_CONCURRENCY).min(total);
        let batch = &files_to_sync[batch_start..batch_end];

        for (offset, filepath) in batch.iter().enumerate() {
            let i = batch_start + offset;
            let filepath_str = filepath.to_string_lossy().to_string();
            current_filepaths.insert(filepath_str.clone());

            let filename = filepath.file_name().and_then(|s| s.to_str()).unwrap_or("unknown").to_string();
            let _ = app.emit("sync-progress", SyncProgress {
                current: i + 1,
                total,
                filename,
            });

            if let Err(e) = coordinator.ingest_file(&filepath_str, None, None, false).await {
                eprintln!("FolderWatcher: Initial sync failed to ingest {}: {}", filepath_str, e);
            }
        }
    }

    for doc in registered_docs {
        let doc_path = PathBuf::from(&doc.filepath);
        if doc_path.starts_with(dir) && !current_filepaths.contains(&doc.filepath) {
            println!("FolderWatcher: Sync removing index for missing file: {}", doc.filepath);
            let _ = coordinator.delete_document(&doc.id).await;
        }
    }

    println!("FolderWatcher: Initial sync completed for {:?}", dir);
    Ok(())
}


fn collect_files_recursively(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if dir.is_dir() {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                collect_files_recursively(&path, files)?;
            } else if should_index_file(&path) {
                files.push(path);
            }
        }
    }
    Ok(())
}
