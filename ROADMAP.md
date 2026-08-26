# PerSona — Roadmap

> See ARCHITECTURE.md for design decisions. This file tracks what's done and what's next.

---

## Phase 1 — Core RAG Pipeline ✅

- [x] Project scaffold: Tauri v2 + React + TypeScript + Vite
- [x] `ModelProvider` trait + `OllamaProvider` implementation
- [x] `VectorStore` trait + `LanceDbStore` (LanceDB embedded)
- [x] SQLite metadata store (`Database`): threads, messages, documents, settings
- [x] Document parser: PDF, DOCX, XLSX, TXT, Markdown, JSON, HTML
- [x] URL ingestion: fetch + html2text scrape
- [x] Sliding-window text chunker (750 tokens, 100 overlap)
- [x] Batch embedding with local cache (avoids re-embedding unchanged chunks)
- [x] RAG retrieval: embed query → top-k vector search → context assembly
- [x] Basic chat UI: threads, messages, streaming tokens

---

## Phase 2 — Agent Loop + Skill System ✅

- [x] `AgentExecutor`: ReAct-style loop with JSON action dispatch
- [x] `SkillRegistry`: list, save, execute skills
- [x] `synthesize_skill` built-in tool: model writes and registers skills autonomously
- [x] `FolderWatcher`: background auto-ingest of a watched directory
- [x] Host server (Axum): REST API for remote thin clients (`/chat`, `/ingest`, `/skills`)
- [x] `list_local_models` command: live model list from Ollama
- [x] Model selector in UI

---

## Phase 3 — Spec Compliance + Settings ✅

- [x] MCP-compatible skill folder format (`tool.json` + `handler.*`)
- [x] GPU/CPU/context window as runtime settings (Settings tab in UI)
- [x] `ARCHITECTURE.md` + `ROADMAP.md` created
- [x] `THIRD_PARTY_LICENSES.md` accurate and complete

---

## Phase 4 — Polish + Cross-Platform 🔜

- [x] Cloud AI Integration (OpenAI, Anthropic) alongside local Ollama
- [x] Onboarding flow: first-run wizard (detect Ollama, pull a model, ingest first document)
- [ ] Windows build: CI pipeline, code-signing, NSIS installer
- [ ] Linux build: AppImage
- [x] Skill management UI: browse, delete, manually edit skills
- [ ] Conversation export (Markdown / JSON)
- [ ] Multi-collection support (separate knowledge bases per project)
- [ ] Plugin API: external skill packs via a URL manifest (industry add-ons, never in core)

---

## Phase 5 — Mobile Thin Client 🔮

- [ ] iOS app (Tauri mobile or SwiftUI): connects to a PerSona host server over local network
- [ ] Android app
- [ ] Mobile-optimised chat UI
- [ ] QR-code pairing with the desktop host

---

## Constraints (Never Violate)

- No GPL / AGPL / SSPL dependencies without explicit approval
- No hardcoded industry/vertical logic in core
- All three subsystem interfaces (`ModelProvider`, `VectorStore`, skill format) must remain swappable
- GPU/CPU backend is always a runtime setting, never a compile-time choice
- No telemetry without explicit user opt-in
