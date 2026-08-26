use rusqlite::params;
use std::path::PathBuf;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThreadRecord {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub agent_id: Option<String>,
    pub category_filter: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CollectionRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub skills: String,
    pub default_category: Option<String>,
    pub collection_ids: Option<String>, // JSON array of collection IDs
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub thread_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub images: Option<Vec<String>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DocumentRecord {
    pub id: String,
    pub filepath: String,
    pub file_hash: String,
    pub file_size: i64,
    pub status: String,
    pub ingested_at: String,
    pub agent_id: Option<String>,
    pub category: Option<String>,
    pub collection_id: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TripleRecord {
    pub id: String,
    pub document_id: String,
    pub subject: String,
    pub relation: String,
    pub object: String,
    pub created_at: String,
}

pub struct Database {
    pub db_path: PathBuf,
    pool: Pool<SqliteConnectionManager>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let db_path = app_data_dir.join("metadata.db");
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        
        let manager = SqliteConnectionManager::file(&db_path)
            .with_init(|c| {
                c.busy_timeout(std::time::Duration::from_secs(10))?;
                c.execute_batch(
                    "PRAGMA journal_mode=WAL;
                     PRAGMA synchronous=NORMAL;
                     PRAGMA foreign_keys=ON;
                     PRAGMA cache_size=-32000;"
                )
            });

        let pool = Pool::builder()
            .max_size(8)
            .build(manager)
            .expect("Failed to create SQLite connection pool");

        Self {
            db_path,
            pool,
        }
    }

    pub fn init(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let conn = self.get_conn()?;

        // Performance: add missing indexes on hot-path columns.
        // These are no-ops if the indexes already exist.
        conn.execute_batch("
            CREATE INDEX IF NOT EXISTS idx_docs_filepath ON documents(filepath);
            CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category);
            CREATE INDEX IF NOT EXISTS idx_msgs_thread   ON messages(thread_id, created_at);
        ").ok(); // best-effort: tables may not exist yet on first run

        // 1. Threads table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS threads (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Try to add agent_id and category_filter columns to existing threads table (will fail silently if already exists)
        let _ = conn.execute("ALTER TABLE threads ADD COLUMN agent_id TEXT", []);
        let _ = conn.execute("ALTER TABLE threads ADD COLUMN category_filter TEXT", []);

        // 1.5 Agents table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // 2. Messages table (cascades delete on thread deletion)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
            )",
            [],
        )?;
        
        // Try to add images column to existing messages table (will fail silently if already exists)
        let _ = conn.execute("ALTER TABLE messages ADD COLUMN images TEXT", []);

        // 3. Documents table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filepath TEXT NOT NULL UNIQUE,
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                status TEXT NOT NULL,
                ingested_at TEXT NOT NULL
            )",
            [],
        )?;

        // Try to add agent_id column to existing documents table
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN agent_id TEXT", []);
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN category TEXT", []);
        let _ = conn.execute("ALTER TABLE documents ADD COLUMN collection_id TEXT", []);

        // Collections table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS collections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // Try to add collections to existing agents table
        let _ = conn.execute("ALTER TABLE agents ADD COLUMN collection_ids TEXT", []);

        // Migration: ensure a Default collection exists and map old docs to it
        let default_collection_id = "default_collection";
        conn.execute(
            "INSERT OR IGNORE INTO collections (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![default_collection_id, "Everything", "Global default collection", chrono::Utc::now().to_rfc3339()],
        )?;
        // Update documents that have no collection_id
        conn.execute(
            "UPDATE documents SET collection_id = ?1 WHERE collection_id IS NULL",
            params![default_collection_id],
        )?;

        // 4. Settings table (for directory watch path, etc.)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        // 5. Embedding Cache table (stores float vector blobs keyed by chunk content hashes)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS embedding_cache (
                chunk_hash TEXT PRIMARY KEY,
                vector BLOB NOT NULL,
                created_at TEXT NOT NULL
            )",
            [],
        )?;

        // 6. FTS5 table for chunks (hybrid search)
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                chunk_id UNINDEXED,
                document_id UNINDEXED,
                text
            )",
            [],
        )?;

        // 7. Graph Triples table for GraphRAG
        conn.execute(
            "CREATE TABLE IF NOT EXISTS graph_triples (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                subject TEXT NOT NULL,
                relation TEXT NOT NULL,
                object TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
            )",
            [],
        )?;
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_triples_doc ON graph_triples(document_id)", []);

        // Migration: Add skills to agents table if it doesn't exist
        // Migration: Add skills and default_category to agents table if it doesn't exist
        let mut stmt = conn.prepare("PRAGMA table_info(agents)")?;
        let rows = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name)
        })?;
        let mut has_skills = false;
        let mut has_default_category = false;
        for row in rows {
            if let Ok(name) = row {
                if name == "skills" {
                    has_skills = true;
                }
                if name == "default_category" {
                    has_default_category = true;
                }
            }
        }
        if !has_skills {
            conn.execute("ALTER TABLE agents ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'", [])?;
        }
        if !has_default_category {
            conn.execute("ALTER TABLE agents ADD COLUMN default_category TEXT", [])?;
        }

        Ok(())
    }

    fn get_conn(&self) -> Result<r2d2::PooledConnection<SqliteConnectionManager>, Box<dyn std::error::Error + Send + Sync>> {
        self.pool.get().map_err(|e| e.into())
    }

    // --- Collections ---

    pub fn create_collection(&self, id: &str, name: &str, description: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO collections (id, name, description, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, description, created_at],
        )?;
        Ok(())
    }

    pub fn list_collections(&self) -> Result<Vec<CollectionRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, name, description, created_at FROM collections ORDER BY created_at ASC")?;
        let rows = stmt.query_map([], |row| {
            Ok(CollectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        let mut collections = Vec::new();
        for r in rows {
            collections.push(r?);
        }
        Ok(collections)
    }

    pub fn get_collection(&self, id: &str) -> Result<Option<CollectionRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, name, description, created_at FROM collections WHERE id = ?1")?;
        let mut iter = stmt.query_map(params![id], |row| {
            Ok(CollectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        Ok(iter.next().transpose()?)
    }

    pub fn delete_collection(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM collections WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_collection(&self, id: &str, name: &str, description: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE collections SET name = ?1, description = ?2 WHERE id = ?3",
            params![name, description, id],
        )?;
        Ok(())
    }

    pub fn create_thread(&self, id: &str, title: &str, agent_id: Option<&str>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO threads (id, title, created_at, agent_id) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, created_at, agent_id],
        )?;
        Ok(())
    }

    pub fn list_threads(&self) -> Result<Vec<ThreadRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, title, created_at, agent_id, category_filter FROM threads ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ThreadRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                agent_id: row.get(3)?,
                category_filter: row.get(4).unwrap_or(None),
            })
        })?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn delete_thread(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM threads WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_thread_title(&self, id: &str, title: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("UPDATE threads SET title = ?1 WHERE id = ?2", params![title, id])?;
        Ok(())
    }

    pub fn set_thread_category_filter(&self, id: &str, category: Option<&str>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("UPDATE threads SET category_filter = ?1 WHERE id = ?2", params![category, id])?;
        Ok(())
    }

    pub fn create_agent(&self, agent: &AgentRecord) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        
        conn.execute(
            "INSERT INTO agents (id, name, description, system_prompt, skills, default_category, collection_ids, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                agent.id,
                agent.name,
                agent.description,
                agent.system_prompt,
                agent.skills,
                agent.default_category,
                agent.collection_ids,
                agent.created_at
            ],
        )?;
        Ok(())
    }

    pub fn get_agent(&self, id: &str) -> Result<Option<AgentRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, name, description, system_prompt, skills, default_category, collection_ids, created_at FROM agents WHERE id = ?1")?;
        
        let mut iter = stmt.query_map(params![id], |row| {
            Ok(AgentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                skills: row.get(4)?,
                default_category: row.get(5)?,
                collection_ids: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        
        if let Some(res) = iter.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn list_agents(&self) -> Result<Vec<AgentRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, name, description, system_prompt, skills, default_category, collection_ids, created_at FROM agents ORDER BY created_at ASC")?;
        
        let iter = stmt.query_map([], |row| {
            Ok(AgentRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                skills: row.get(4)?,
                default_category: row.get(5)?,
                collection_ids: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        
        let mut agents = Vec::new();
        for agent in iter {
            agents.push(agent?);
        }
        Ok(agents)
    }

    pub fn update_agent(&self, agent: &AgentRecord) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE agents SET name = ?1, description = ?2, system_prompt = ?3, skills = ?4, default_category = ?5, collection_ids = ?6 WHERE id = ?7",
            params![
                agent.name,
                agent.description,
                agent.system_prompt,
                agent.skills,
                agent.default_category,
                agent.collection_ids,
                agent.id
            ],
        )?;
        Ok(())
    }

    pub fn delete_agent(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM agents WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn save_message(&self, id: &str, thread_id: &str, role: &str, content: &str, images: Option<Vec<String>>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let created_at = chrono::Utc::now().to_rfc3339();
        let images_json = images.map(|imgs| serde_json::to_string(&imgs).unwrap_or_else(|_| "[]".to_string()));
        conn.execute(
            "INSERT INTO messages (id, thread_id, role, content, created_at, images) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, thread_id, role, content, created_at, images_json],
        )?;
        Ok(())
    }

    pub fn get_chat_history(&self, thread_id: &str) -> Result<Vec<MessageRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, thread_id, role, content, created_at, images FROM messages WHERE thread_id = ?1 ORDER BY created_at ASC")?;
        let rows = stmt.query_map(params![thread_id], |row| {
            let images_str: Option<String> = row.get(5).unwrap_or(None);
            let images = images_str.and_then(|s| serde_json::from_str(&s).ok());
            Ok(MessageRecord {
                id: row.get(0)?,
                thread_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                images,
            })
        })?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn upsert_document(&self, doc: &DocumentRecord) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT INTO documents (id, filepath, file_hash, file_size, status, ingested_at, agent_id, category, collection_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(filepath) DO UPDATE SET
                file_hash = excluded.file_hash,
                file_size = excluded.file_size,
                status = excluded.status,
                ingested_at = excluded.ingested_at,
                agent_id = excluded.agent_id,
                category = excluded.category,
                collection_id = excluded.collection_id",
            params![
                doc.id,
                doc.filepath,
                doc.file_hash,
                doc.file_size,
                doc.status,
                doc.ingested_at,
                doc.agent_id,
                doc.category,
                doc.collection_id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_document(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn mark_document_excluded(&self, id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("UPDATE documents SET status = 'excluded' WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Returns ALL documents regardless of agent_id (used for cross-agent lookup)
    pub fn list_all_documents(&self) -> Result<Vec<DocumentRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, filepath, file_hash, file_size, status, ingested_at, agent_id, category, collection_id FROM documents WHERE status != 'excluded'")?;
        let doc_iter = stmt.query_map([], |row| {
            Ok(DocumentRecord {
                id: row.get(0)?,
                filepath: row.get(1)?,
                file_hash: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                ingested_at: row.get(5)?,
                agent_id: row.get(6)?,
                category: row.get(7)?,
                collection_id: row.get(8)?,
            })
        })?;
        let mut list = Vec::new();
        for r in doc_iter {
            list.push(r?);
        }
        Ok(list)
    }

    /// Efficiently returns only the document IDs that belong to a given category.
    /// Uses the idx_docs_category index — avoids deserializing every document row.
    pub fn get_doc_ids_for_category(
        &self,
        category: &str,
    ) -> Result<std::collections::HashSet<String>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare(
            "SELECT id FROM documents WHERE category = ?1 AND status = 'completed'",
        )?;
        let ids = stmt
            .query_map(params![category], |r| r.get::<_, String>(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(ids)
    }

    #[allow(dead_code)]
    pub fn clear_documents(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM documents", params![])?;
        // Also clear the auto-sync directory so background watchers don't instantly re-ingest
        conn.execute("DELETE FROM settings WHERE key = 'sync_directory'", params![])?;
        // Clear FTS chunks
        let _ = conn.execute("DELETE FROM chunks_fts", []);
        Ok(())
    }

    /// Delete only documents belonging to a specific collection and their FTS chunks.
    /// Does NOT clear the sync_directory setting or documents from other collections.
    pub fn clear_documents_for_collection(&self, collection_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        // Collect document IDs for this collection first
        let mut stmt = conn.prepare("SELECT id FROM documents WHERE collection_id = ?1")?;
        let ids: Vec<String> = stmt.query_map(params![collection_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        // Delete FTS chunks for each document
        for doc_id in &ids {
            let _ = conn.execute("DELETE FROM chunks_fts WHERE document_id = ?1", params![doc_id]);
        }
        // Delete all documents in this collection
        conn.execute("DELETE FROM documents WHERE collection_id = ?1", params![collection_id])?;
        Ok(())
    }

    /// Null out the collection_id for all documents that belong to the given collection.
    /// Used when deleting a collection — documents are kept but disassociated.
    pub fn disassociate_documents_from_collection(&self, collection_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "UPDATE documents SET collection_id = NULL WHERE collection_id = ?1",
            params![collection_id],
        )?;
        Ok(())
    }

    pub fn factory_reset(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        // Clear all tables
        let _ = conn.execute("DELETE FROM documents", []);
        let _ = conn.execute("DELETE FROM chunks_fts", []);
        let _ = conn.execute("DELETE FROM agents", []);
        let _ = conn.execute("DELETE FROM threads", []);
        let _ = conn.execute("DELETE FROM messages", []);
        let _ = conn.execute("DELETE FROM embedding_cache", []);
        let _ = conn.execute("DELETE FROM settings", []);
        Ok(())
    }

    pub fn update_document_category(&self, id: &str, category: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let cat_opt = if category.trim().is_empty() { None } else { Some(category) };
        conn.execute("UPDATE documents SET category = ?1 WHERE id = ?2", params![cat_opt, id])?;
        Ok(())
    }

    pub fn update_document_collection(&self, id: &str, collection_id: Option<&str>) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("UPDATE documents SET collection_id = ?1 WHERE id = ?2", params![collection_id, id])?;
        Ok(())
    }

    pub fn list_documents(&self, agent_id: Option<&str>) -> Result<Vec<DocumentRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut sql = "SELECT id, filepath, file_hash, file_size, status, ingested_at, agent_id, category, collection_id FROM documents".to_string();
        let mut params: Vec<String> = Vec::new();
        
        if let Some(aid) = agent_id {
            sql.push_str(" WHERE agent_id = ?1 AND status != 'excluded'");
            params.push(aid.to_string());
        } else {
            sql.push_str(" WHERE agent_id IS NULL AND status != 'excluded'");
        }
        
        sql.push_str(" ORDER BY ingested_at DESC");
        
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok(DocumentRecord {
                id: row.get(0)?,
                filepath: row.get(1)?,
                file_hash: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                ingested_at: row.get(5)?,
                agent_id: row.get(6)?,
                category: row.get(7)?,
                collection_id: row.get(8)?,
            })
        })?;
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn get_document(&self, id: &str) -> Result<Option<DocumentRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, filepath, file_hash, file_size, status, ingested_at, agent_id, category, collection_id FROM documents WHERE id = ?1")?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(DocumentRecord {
                id: row.get(0)?,
                filepath: row.get(1)?,
                file_hash: row.get(2)?,
                file_size: row.get(3)?,
                status: row.get(4)?,
                ingested_at: row.get(5)?,
                agent_id: row.get(6)?,
                category: row.get(7)?,
                collection_id: row.get(8)?,
            })
        })?;
        let result = if let Some(res) = rows.next() {
            Some(res?)
        } else {
            None
        };
        Ok(result)
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            let val: String = row.get(0)?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_cached_embedding(&self, chunk_hash: &str) -> Result<Option<Vec<f32>>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT vector FROM embedding_cache WHERE chunk_hash = ?1")?;
        let mut rows = stmt.query(params![chunk_hash])?;
        if let Some(row) = rows.next()? {
            let bytes: Vec<u8> = row.get(0)?;
            let mut vector = Vec::with_capacity(bytes.len() / 4);
            for chunk in bytes.chunks_exact(4) {
                let buf: [u8; 4] = chunk.try_into().unwrap_or([0; 4]);
                vector.push(f32::from_le_bytes(buf));
            }
            Ok(Some(vector))
        } else {
            Ok(None)
        }
    }

    pub fn cache_embedding(&self, chunk_hash: &str, vector: &[f32]) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut bytes = Vec::with_capacity(vector.len() * 4);
        for &f in vector {
            bytes.extend_from_slice(&f.to_le_bytes());
        }
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO embedding_cache (chunk_hash, vector, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(chunk_hash) DO UPDATE SET created_at = excluded.created_at",
            params![chunk_hash, bytes, created_at],
        )?;

        // Enforce max-size cache cap: 10,000 entries max to prevent disk bloat
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM embedding_cache", [], |r| r.get(0))?;
        if count > 10000 {
            // Delete the oldest 1,000 records to minimize database write cycles
            let to_delete = count - 9000;
            conn.execute(
                &format!("DELETE FROM embedding_cache WHERE chunk_hash IN (
                    SELECT chunk_hash FROM embedding_cache ORDER BY created_at ASC LIMIT {}
                )", to_delete),
                [],
            )?;
        }
        Ok(())
    }

    pub fn insert_fts_chunk(&self, chunk_id: &str, document_id: &str, text: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute(
            "INSERT INTO chunks_fts (chunk_id, document_id, text) VALUES (?1, ?2, ?3)",
            params![chunk_id, document_id, text],
        )?;
        Ok(())
    }

    pub fn delete_fts_document(&self, document_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM chunks_fts WHERE document_id = ?1", params![document_id])?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn clear_fts_chunks(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        conn.execute("DELETE FROM chunks_fts", [])?;
        Ok(())
    }


    pub fn get_document_text(&self, document_id: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT text FROM chunks_fts WHERE document_id = ?1")?;
        let rows = stmt.query_map(params![document_id], |row| {
            let text: String = row.get(0)?;
            Ok(text)
        })?;
        
        let mut full_text = String::new();
        for r in rows {
            if let Ok(text) = r {
                full_text.push_str(&text);
                full_text.push_str("\n\n");
            }
        }
        
        Ok(full_text.trim().to_string())
    }

    pub fn search_fts(&self, query: &str, limit: usize, agent_id: Option<String>) -> Result<Vec<(String, String, String, f32)>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        
        // Basic escaping: remove quotes, treat each word as an FTS term
        let safe_query = query.replace('"', " ").replace('\'', " ").replace('-', " ");
        let mut fts_query = String::new();
        for word in safe_query.split_whitespace() {
            fts_query.push_str(word);
            fts_query.push_str("* ");
        }
        
        if fts_query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let mut sql = "
            SELECT c.chunk_id, c.document_id, c.text, bm25(c) as rank 
            FROM chunks_fts c 
            JOIN documents d ON c.document_id = d.id 
            WHERE c.chunks_fts MATCH ?1 
        ".to_string();
        
        let mut params: Vec<rusqlite::types::Value> = vec![rusqlite::types::Value::Text(fts_query)];

        if let Some(aid) = agent_id {
            sql.push_str(" AND d.agent_id = ?2");
            params.push(rusqlite::types::Value::Text(aid));
        } else {
            sql.push_str(" AND d.agent_id IS NULL");
        }

        sql.push_str(" ORDER BY rank LIMIT ");
        sql.push_str(&limit.to_string());

        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
            let chunk_id: String = row.get(0)?;
            let document_id: String = row.get(1)?;
            let text: String = row.get(2)?;
            let rank: f64 = row.get(3)?;
            // rank is negative in BM25 (more negative = better), so we negate it for a positive score
            Ok((chunk_id, document_id, text, -rank as f32))
        })?;
        
        let mut results = Vec::new();
        for r in rows {
            results.push(r?);
        }
        Ok(results)
    }

    pub fn save_triple(
        &self,
        document_id: &str,
        subject: &str,
        relation: &str,
        object: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO graph_triples (id, document_id, subject, relation, object, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, document_id, subject.trim(), relation.trim(), object.trim(), created_at],
        )?;
        Ok(())
    }

    pub fn list_triples(&self) -> Result<Vec<TripleRecord>, Box<dyn std::error::Error + Send + Sync>> {
        let conn = self.get_conn()?;
        let mut stmt = conn.prepare("SELECT id, document_id, subject, relation, object, created_at FROM graph_triples ORDER BY created_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(TripleRecord {
                id: row.get(0)?,
                document_id: row.get(1)?,
                subject: row.get(2)?,
                relation: row.get(3)?,
                object: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        
        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_setting_and_embedding_cache() {
        let temp_dir = std::env::temp_dir();
        let db = Database::new(temp_dir.clone());
        db.init().unwrap();

        // 1. Test key-value general settings
        db.set_setting("test_key", "test_value").unwrap();
        let val = db.get_setting("test_key").unwrap();
        assert_eq!(val, Some("test_value".to_string()));

        // 2. Test vector embedding binary blob packing/unpacking
        let mock_hash = "abc123hash";
        let mock_vector = vec![0.1f32, -0.2f32, 3.14f32, -42.0f32];
        
        db.cache_embedding(mock_hash, &mock_vector).unwrap();
        let cached = db.get_cached_embedding(mock_hash).unwrap();
        
        assert!(cached.is_some());
        let unpacked = cached.unwrap();
        assert_eq!(unpacked.len(), mock_vector.len());
        for i in 0..mock_vector.len() {
            assert!((unpacked[i] - mock_vector[i]).abs() < 1e-6);
        }

        // Clean up metadata db file
        let _ = std::fs::remove_file(db.db_path);
    }
}

