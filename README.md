# PerSona — Your Private AI Knowledge Assistant

> Ask questions about your own documents. Offline. No cloud. No subscriptions.

PerSona is a **local-first AI assistant** that turns your files into a searchable, conversational knowledge base — powered entirely by models running on your own machine via [Ollama](https://ollama.com).

---

## What It Does

You drop in your documents. PerSona reads them, understands them, and lets you have a natural conversation about them — no data ever leaves your device.

- 📄 **Ingest anything** — PDF, DOCX, TXT, Markdown, HTML, Excel, JSON, OpenAPI specs, Postman collections, and web URLs
- 🧠 **Ask in plain English** — RAG-powered retrieval finds the right context before answering
- 🤖 **Auto-creates tools** — the model learns from your documents and writes reusable skill scripts as it works
- 🔄 **Syncs live** — watch a folder and it ingests changes automatically in the background
- 🌐 **Runs as a server** — expose a REST API so other devices on your network can connect
- 🔒 **Fully offline** — every model, vector, and document stays on your machine

---

## Screenshots & Features

<div align="center">

### 💬 Chat & Offline RAG
Conversational search with direct citations, document previews, and streaming reasoning.
<img src="docs/screenshots/ui-chat-rag.png" alt="Chat & RAG Interface" width="850" />

<br/><br/>

### 📚 Knowledge Base
Manage document indexing, categories, collections, and vector search.
<img src="docs/screenshots/ui-knowledge-base.png" alt="Knowledge Base View" width="850" />

<br/><br/>

### 📁 Isolated Collections
Group and isolate documents into specific vector workspaces.
<img src="docs/screenshots/ui-collections.png" alt="Collections View" width="850" />

<br/><br/>

### ⚡ Skill Studio (MCP Tool Registry)
Dynamic tool synthesis and secure MCP script execution.
<img src="docs/screenshots/ui-skills.png" alt="Skills Studio" width="850" />

<br/><br/>

### 👥 Custom Agents
Specialized AI personas with customized instructions and assigned skill sets.
<img src="docs/screenshots/ui-agents.png" alt="Custom Agents View" width="850" />

</div>



## How It Works

```
Your Files → Parser → Chunker → Embeddings (Ollama) → LanceDB Vector Store
                                                              ↓
                     User Question → RAG Retrieval → Agent Executor → Local LLM → Answer
```

The **Agent Executor** loop gives the model access to tools (skills). If a skill doesn't exist yet, it writes one automatically via `synthesize_skill` and registers it for future use.

---

## Prerequisites & System Dependencies

When someone clones the repository, running **`npm install`** and **`npm run tauri dev`** will automatically install and compile all Node.js and Rust crate dependencies.

However, the host machine must have the following developer tools installed:

### 1. Core Tooling
- **Node.js** (v18+) — [nodejs.org](https://nodejs.org)
- **Rust & Cargo** (1.80+) — [rustup.rs](https://rustup.rs)
- **Ollama** — [ollama.com](https://ollama.com)

### 2. OS-Specific System Dependencies

<details>
<summary><b>🍎 macOS</b></summary>

```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Ollama & Node.js (via Homebrew if preferred)
brew install node ollama
```
</details>

<details>
<summary><b>🐧 Linux (Ubuntu / Debian)</b></summary>

```bash
# Install Tauri v2 system build libraries
sudo apt-get update && sudo apt-get install -y \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```
</details>

<details>
<summary><b>🪟 Windows</b></summary>

1. Install **Microsoft C++ Build Tools** (via Visual Studio Installer with "Desktop development with C++").
2. Install **WebView2 Runtime** (pre-installed on Windows 10/11).
3. Install **Node.js** and **Rust** via `rustup-init.exe`.
</details>

---

## Quick Start (3 Steps)

### 1. Start Ollama and pull your preferred model
```bash
# Start Ollama service (if not running in background)
ollama serve

# Pull default models
ollama pull llama3.2
ollama pull nomic-embed-text
```

### 2. Clone repository & install dependencies
```bash
git clone https://github.com/MayankGit-hu/PerSona.git
cd PerSona
npm install
```

> **Note:** `npm install` downloads all frontend packages. Cargo will automatically download and compile all Rust crates on the first run.

### 3. Launch PerSona
```bash
npm run tauri dev
```

---

## Usage

1. **Add documents** — click the Knowledge Base tab and drag in files, paste a URL, or point to a local folder to auto-sync
2. **Start a conversation** — open a new chat and ask anything about your documents
3. **Watch skills grow** — as you ask questions, the model registers reusable tools in the Skill Library automatically
4. **Switch models** — use the Runtime Provider Model selector in the sidebar; all available Ollama models appear automatically
5. **Share with other devices** — enable the Host Server toggle in Network Settings to expose the REST API on your local network

---

## Building for Production

```bash
npm run tauri build
```

The signed `.app` bundle is output to `src-tauri/target/release/bundle/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Tauri v2 (Rust + WebView) |
| Frontend | React + TypeScript + Vite |
| LLM Runtime | Ollama (local) |
| Vector Store | LanceDB (embedded) |
| Metadata DB | SQLite |
| HTTP Server | Axum |
| Parsers | lopdf, calamine, html2text, quick-xml |

---

## License

MIT
