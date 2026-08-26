# PerSona — Architecture

> Last updated: 2026-07-10

---

## Module Map

| File | Role |
|---|---|
| `main.rs` | Binary entry point — delegates to `lib.rs` |
| `lib.rs` | App bootstrap: reads settings, wires all subsystems, registers Tauri commands |
| `models.rs` | `ModelProvider` trait + `OllamaProvider` impl (generate, embed, list_models) |
| `vector.rs` | `VectorStore` trait + `LanceDbStore` impl (upsert, query, delete) |
| `db.rs` | SQLite wrapper — threads, messages, documents, settings, embedding cache |
| `rag.rs` | `RagCoordinator` — orchestrates ingest (parser → chunker → embed → upsert) and retrieval (embed query → vector search → context assembly) |
| `parser.rs` | Format dispatchers: PDF (lopdf), DOCX (zip+quick-xml), XLSX (calamine), HTML (html2text), TXT/MD/JSON (raw), URL (reqwest+scrape) |
| `chunker.rs` | Sliding-window text splitter with configurable chunk size and overlap |
| `agent.rs` | `AgentExecutor` — ReAct-style loop: system-prompt → LLM → JSON action dispatch → tool call → feed result back → repeat until `"action":"respond"` |
| `skills.rs` | `SkillRegistry` — MCP-compatible skill store; each skill is a folder with `tool.json` + `handler.*`; list, save, execute |
| `commands.rs` | All Tauri IPC commands (bridge between frontend and Rust subsystems) |
| `sync.rs` | `FolderWatcher` — uses `notify` to watch a user-selected directory and auto-ingest new/changed files |
| `server.rs` | Axum HTTP server — exposes `/chat`, `/ingest`, `/skills` REST endpoints for remote thin clients |

---

## Interface Contracts

These three interfaces are the only way external code touches their subsystem. Implementations can be swapped without changing callers.

### ModelProvider (`models.rs`)
```rust
trait ModelProvider: Send + Sync {
    async fn generate(prompt, options) -> Result<String>
    async fn chat_stream(messages, options) -> Result<BoxStream<String>>
    async fn embed(text, model_name) -> Result<Vec<f32>>
    async fn embed_batch(texts, model_name) -> Result<Vec<Vec<f32>>>
    async fn list_models() -> Result<Vec<String>>
}
```
Current impl: `OllamaProvider` (Ollama REST API at configurable base URL)
Future impls: llama.cpp HTTP, MLX, vLLM

### VectorStore (`vector.rs`)
```rust
trait VectorStore: Send + Sync {
    async fn initialize(collection) -> Result<()>
    async fn upsert(collection, records) -> Result<()>
    async fn query(collection, query) -> Result<Vec<SearchResult>>
    async fn delete(collection, filter) -> Result<()>
}
```
Current impl: `LanceDbStore` (embedded, disk-based LanceDB)
Future impls: sqlite-vec, Qdrant

### Skill Format (`skills/`)
Each skill lives in a named folder:
```
skills/
  {skill_name}/
    tool.json      ← MCP-compatible JSON Schema descriptor
    handler.js     ← executable (Node.js or Python)
```

`tool.json` shape (MCP tool schema):
```json
{
  "name": "skill_name",
  "description": "What this skill does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param": { "type": "number", "description": "..." }
    },
    "required": ["param"]
  }
}
```

---

## Data Flows

### Ingest Path
```
User drops file / URL / folder
        ↓
commands::ingest_file / ingest_url / set_sync_directory
        ↓
rag::RagCoordinator::ingest_file()
        ↓
parser::extract_text(filepath)          ← format-dispatched
        ↓
chunker::chunk_text(text, 750, 100)     ← sliding window, 750 tok / 100 overlap
        ↓
ModelProvider::embed_batch(chunks)      ← nomic-embed-text (configurable)
        ↓
VectorStore::upsert("knowledge_base")   ← LanceDB, disk-local
        ↓
Database::upsert_document()             ← SQLite metadata record
```

### Chat / Agent Path
```
User sends message
        ↓
commands::send_chat_message
        ↓
AgentExecutor::run_agent_loop()
  ├─ Loads chat history from SQLite
  ├─ Loads registered skills from SkillRegistry
  ├─ Embeds user message → VectorStore::query() → top-k chunks
  ├─ Builds system prompt (skills list + RAG context + JSON format rules)
  └─ ReAct loop (max 5 steps):
       LLM → JSON { action: "call", tool, arguments }
         ├─ tool == "synthesize_skill" → SkillRegistry::save_skill()
         └─ tool == <any registered skill> → SkillRegistry::execute_skill()
       Feed result back as system message → repeat
       LLM → JSON { action: "respond", content }
         └─ stream content tokens to frontend via Tauri Channel
```

---

## Storage Layout

```
~/Library/Application Support/com.persona.app/
  metadata.db          ← SQLite: threads, messages, documents, settings, embedding_cache
  lancedb/
    knowledge_base/    ← LanceDB vector collection
  skills/
    {skill_name}/
      tool.json
      handler.js / handler.py
```

---

## Runtime-Configurable Settings

All stored in SQLite `settings` table. Never baked into the binary.

| Key | Default | Effect |
|---|---|---|
| `ollama_base_url` | `http://localhost:11434` | Points `OllamaProvider` at any Ollama instance |
| `ollama_num_gpu` | `-1` (auto) | GPU layers passed to Ollama `num_gpu` option |
| `ollama_num_ctx` | `4096` | Context window token limit |
| `embedding_model` | `nomic-embed-text:latest` | Model used for all chunk and query embeddings |
| `sync_directory` | (none) | Folder watched for auto-ingest |
| `api_passcode` | (auto-generated UUID fragment) | Bearer token for the local REST server |
