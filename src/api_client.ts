import { invoke } from "@tauri-apps/api/core";

export interface Document {
  id: string;
  filepath: string;
  file_hash: string;
  file_size: number;
  status: string;
  ingested_at: string;
  category?: string;
  collection_id?: string;
}

export interface Artifact {
  id: string;
  title: string;
  type: string;
  content: string;
}

export interface Thread {
  id: string;
  title: string;
  created_at: string;
  agent_id?: string;
  category_filter?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  skills: string;
  default_category?: string;
  collection_ids?: string;
  created_at: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Message {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
  images?: string[];
}

export interface Skill {
  name: string;
  description: string;
  input_schema: any;
  handler_path: string;
  language: string;
  approved: boolean;
  created_at: string;
  last_used_at?: string;
  code: string;
}

export interface HostNetworkInfo {
  ip: string;
  passcode: string;
  is_running: boolean;
  port: number;
}

export interface VectorRecord {
  id: string;
  vector: number[];
  payload: any;
}

export interface SearchResult {
  record: VectorRecord;
  distance: number;
}

export interface Triple {
  id: string;
  document_id: string;
  subject: string;
  relation: string;
  object: string;
  created_at: string;
}

export interface ApiAdapter {
  listDocuments(agentId?: string): Promise<Document[]>;
  listAllDocuments(): Promise<Document[]>;
  listGraphTriples(): Promise<Triple[]>;
  deleteDocument(id: string): Promise<void>;
  updateDocumentCategory(id: string, category: string): Promise<void>;
  updateDocumentCollection(id: string, collectionId: string | null): Promise<void>;
  factoryReset(): Promise<void>;
  saveSettings(settings: any): Promise<void>;

  createCollection(id: string, name: string, description: string): Promise<void>;
  listCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | null>;
  updateCollection(id: string, name: string, description: string): Promise<void>;
  deleteCollection(id: string): Promise<void>;
  clearCollection(collectionId: string): Promise<void>;
  ingestUrl(url: string, agentId?: string, collectionId?: string): Promise<void>;
  listSkills(): Promise<Skill[]>;
  deleteSkill(name: string): Promise<void>;
  getSkillFiles(name: string): Promise<{ tool_json: string; handler_js: string }>;
  saveSkillFiles(name: string, tool_json: string, handler_js: string): Promise<void>;
  sendChatMessage(
    threadId: string,
    userMessage: string,
    modelName: string,
    categoryFilter: string | null,
    images: string[] | undefined,
    mentionedDocumentIds: string[] | undefined,
    onMessage: (data: any) => void,
    signal?: AbortSignal
  ): Promise<void>;
  
  // Threads APIs
  listThreads(): Promise<Thread[]>;
  createThread(id?: string, title?: string, agentId?: string): Promise<Thread>;
  renameThread(id: string, title: string): Promise<void>;
  setThreadCategory(id: string, category: string | null): Promise<void>;
  deleteThread(id: string): Promise<void>;
  exportChatThread(threadId: string, format: string, filepath: string): Promise<void>;
  getChatHistory(threadId: string): Promise<Message[]>;
  listModels(): Promise<string[]>;

  // Agents APIs
  listAgents(): Promise<Agent[]>;
  createAgent(id: string, name: string, description: string, systemPrompt: string, skills: string[], defaultCategory?: string): Promise<void>;
  updateAgent(id: string, name: string, description: string, systemPrompt: string, skills: string[], defaultCategory?: string): Promise<void>;
  deleteAgent(id: string): Promise<void>;

  // Vector DB APIs
  getAllChunks(): Promise<VectorRecord[]>;
  deleteChunk(chunkId: string): Promise<void>;
  updateChunk(chunkId: string, documentId: string, text: string, chunkIndex: number, agentId?: string): Promise<void>;
  findSimilarChunks(chunkText: string): Promise<SearchResult[]>;
}

export class TauriApiAdapter implements ApiAdapter {
  async listDocuments(agentId?: string): Promise<Document[]> {
    return invoke<Document[]>("list_documents", { agentId });
  }

  async listAllDocuments(): Promise<Document[]> {
    return invoke<Document[]>("list_all_documents");
  }

  async listGraphTriples(): Promise<Triple[]> {
    return invoke<Triple[]>("list_graph_triples");
  }

  async deleteDocument(id: string): Promise<void> {
    return invoke("delete_document", { id });
  }

  async updateDocumentCategory(id: string, category: string): Promise<void> {
    return invoke("update_document_category", { id, category });
  }

  async updateDocumentCollection(id: string, collectionId: string | null): Promise<void> {
    return invoke("update_document_collection", { id, collectionId });
  }

  async factoryReset(): Promise<void> {
    return invoke("factory_reset");
  }

  async saveSettings(settings: any): Promise<void> {
    return invoke("save_settings", { settings });
  }

  async createCollection(id: string, name: string, description: string): Promise<void> {
    return invoke("create_collection", { id, name, description });
  }

  async listCollections(): Promise<Collection[]> {
    return invoke("list_collections");
  }

  async getCollection(id: string): Promise<Collection | null> {
    return invoke("get_collection", { id });
  }

  async updateCollection(id: string, name: string, description: string): Promise<void> {
    return invoke("update_collection", { id, name, description });
  }

  async deleteCollection(id: string): Promise<void> {
    return invoke("delete_collection", { id });
  }

  async clearCollection(collectionId: string): Promise<void> {
    return invoke("clear_collection", { collectionId });
  }

  async ingestUrl(url: string, agentId?: string, collectionId?: string): Promise<void> {
    return invoke("ingest_url", { url, agentId, collectionId });
  }

  async listSkills(): Promise<Skill[]> {
    return invoke<Skill[]>("list_skills");
  }

  async deleteSkill(name: string): Promise<void> {
    return invoke("delete_skill", { name });
  }

  async getSkillFiles(skillName: string): Promise<{ tool_json: string; handler_js: string }> {
    return invoke("get_skill_files", { skillName });
  }

  async saveSkillFiles(skillName: string, toolJson: string, handlerJs: string): Promise<void> {
    return invoke("save_skill_files", { skillName, toolJson, handlerJs });
  }

  async sendChatMessage(
    threadId: string,
    userMessage: string,
    modelName: string,
    categoryFilter: string | null,
    images: string[] | undefined,
    mentionedDocumentIds: string[] | undefined,
    onMessage: (data: any) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const { Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<string>();
    channel.onmessage = (msgStr) => {
      if (signal?.aborted) return;
      try {
        const data = JSON.parse(msgStr);
        onMessage(data);
      } catch (err) {
        console.error("Failed to parse Tauri socket packet:", err);
      }
    };

    await invoke("send_chat_message", {
      threadId,
      userMessage,
      images: images && images.length > 0 ? images : null,
      modelName,
      categoryFilter,
      mentionedDocumentIds: mentionedDocumentIds && mentionedDocumentIds.length > 0 ? mentionedDocumentIds : null,
      onChunk: channel,
    });
  }

  async listThreads(): Promise<Thread[]> {
    return invoke<Thread[]>("list_chat_threads");
  }

  async createThread(id?: string, title?: string, agentId?: string): Promise<Thread> {
    return invoke<Thread>("create_chat_thread", { id, title: title || "New Conversation", agentId });
  }

  async renameThread(id: string, title: string): Promise<void> {
    return invoke("rename_thread", { id, title });
  }

  async setThreadCategory(id: string, category: string | null): Promise<void> {
    return invoke("set_thread_category", { id, category });
  }

  async deleteThread(id: string): Promise<void> {
    return invoke("delete_chat_thread", { id });
  }

  async exportChatThread(threadId: string, format: string, filepath: string): Promise<void> {
    return invoke("export_chat_thread", { threadId, format, filepath });
  }

  async getChatHistory(threadId: string): Promise<Message[]> {
    return invoke<Message[]>("get_chat_history", { threadId });
  }

  async listModels(): Promise<string[]> {
    return invoke<string[]>("list_local_models");
  }

  async listAgents(): Promise<Agent[]> {
    return invoke<Agent[]>("list_agents");
  }

  async createAgent(id: string, name: string, description: string, systemPrompt: string, skills: string[], defaultCategory?: string): Promise<void> {
    return invoke("create_agent", { id, name, description, systemPrompt, skills, defaultCategory });
  }

  async updateAgent(id: string, name: string, description: string, systemPrompt: string, skills: string[], defaultCategory?: string): Promise<void> {
    return invoke("update_agent", { id, name, description, systemPrompt, skills, defaultCategory });
  }

  async deleteAgent(id: string): Promise<void> {
    return invoke("delete_agent", { id });
  }

  async getAllChunks(): Promise<VectorRecord[]> {
    return invoke<VectorRecord[]>("get_all_chunks");
  }

  async deleteChunk(chunkId: string): Promise<void> {
    return invoke("delete_chunk", { chunkId });
  }

  async updateChunk(chunkId: string, documentId: string, text: string, chunkIndex: number, agentId?: string): Promise<void> {
    return invoke("update_chunk", { chunkId, documentId, text, chunkIndex, agentId });
  }

  async findSimilarChunks(chunkText: string): Promise<SearchResult[]> {
    return invoke<SearchResult[]>("find_similar_chunks", { chunkText });
  }
}

export class RemoteApiAdapter implements ApiAdapter {
  private hostUrl: string;
  private passcode: string;

  constructor(hostIp: string, port: number, passcode: string) {
    this.hostUrl = `http://${hostIp}:${port}`;
    this.passcode = passcode;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.passcode) {
      headers["Authorization"] = `Bearer ${this.passcode}`;
    }
    return headers;
  }

  async createCollection(_id: string, _name: string, _description: string): Promise<void> {
    console.warn("Collections not fully supported in remote mode yet");
  }

  async listCollections(): Promise<Collection[]> {
    return [];
  }

  async getCollection(_id: string): Promise<Collection | null> {
    return null;
  }

  async updateCollection(_id: string, _name: string, _description: string): Promise<void> {
    console.warn("Collections not fully supported in remote mode yet");
  }

  async deleteCollection(_id: string): Promise<void> {
    console.warn("Collections not fully supported in remote mode yet");
  }

  async clearCollection(_collectionId: string): Promise<void> {
    console.warn("Collections not fully supported in remote mode yet");
  }

  async listDocuments(agentId?: string): Promise<Document[]> {
    const res = await fetch(`${this.hostUrl}/api/documents${agentId ? `?agent_id=${agentId}` : ""}`, {
      headers: { "Authorization": `Bearer ${this.passcode}` }
    });
    if (!res.ok) throw new Error("Failed to fetch documents");
    return res.json();
  }

  async listAllDocuments(): Promise<Document[]> {
    const res = await fetch(`${this.hostUrl}/api/documents/all`, {
      headers: { "Authorization": `Bearer ${this.passcode}` }
    });
    if (!res.ok) throw new Error("Failed to fetch all documents");
    return res.json();
  }

  async listGraphTriples(): Promise<Triple[]> {
    const res = await fetch(`${this.hostUrl}/api/graph/triples`, {
      headers: { "Authorization": `Bearer ${this.passcode}` }
    });
    if (!res.ok) return []; // Fallback to empty if remote server does not support it yet
    return res.json();
  }

  async deleteDocument(id: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/documents/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${this.passcode}` }
    });
    if (!res.ok) throw new Error("Failed to delete document");
  }

  async ingestUrl(url: string, agentId?: string, collectionId?: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/documents/url`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.passcode}`
      },
      body: JSON.stringify({ url, agent_id: agentId, collection_id: collectionId })
    });
    if (!res.ok) throw new Error("Failed to ingest URL");
  }

  async listSkills(): Promise<Skill[]> {
    const res = await fetch(`${this.hostUrl}/api/skills`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async deleteSkill(name: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/skills/${name}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async sendChatMessage(
    threadId: string,
    userMessage: string,
    modelName: string,
    categoryFilter: string | null,
    images: string[] | undefined,
    mentionedDocumentIds: string[] | undefined,
    onMessage: (data: any) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/chat`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        thread_id: threadId,
        user_message: userMessage,
        images: images && images.length > 0 ? images : null,
        mentioned_document_ids: mentionedDocumentIds && mentionedDocumentIds.length > 0 ? mentionedDocumentIds : null,
        model_name: modelName,
        category_filter: categoryFilter,
      }),
      signal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      if (signal?.aborted) {
        reader.cancel();
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data:")) {
          const jsonStr = trimmed.substring(5).trim();
          try {
            const data = JSON.parse(jsonStr);
            onMessage(data);
          } catch (err) {
            console.error("Failed to parse SSE JSON:", err);
          }
        }
      }
    }
  }

  async listThreads(): Promise<Thread[]> {
    const res = await fetch(`${this.hostUrl}/api/threads`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async exportChatThread(_threadId: string, _format: string, _filepath: string): Promise<void> {
    console.warn("exportChatThread not implemented for remote mode");
  }

  async saveSettings(_settings: any): Promise<void> {
    console.warn("saveSettings not implemented for remote mode");
  }

  async createThread(id?: string, title?: string, agentId?: string): Promise<Thread> {
    const res = await fetch(`${this.hostUrl}/api/threads`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ id, title, agent_id: agentId }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async renameThread(id: string, title: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/threads/${id}`, {
      method: "PATCH",
      headers: { ...this.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async setThreadCategory(id: string, category: string | null): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/threads/${id}`, {
      method: "PATCH",
      headers: { ...this.getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ category_filter: category }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async deleteThread(id: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/threads/${id}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async getChatHistory(threadId: string): Promise<Message[]> {
    const res = await fetch(`${this.hostUrl}/api/threads/${threadId}/messages`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async listModels(): Promise<string[]> {
    const res = await fetch(`${this.hostUrl}/api/models`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async listAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.hostUrl}/api/agents`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async createAgent(id: string, name: string, description: string, systemPrompt: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/agents`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ id, name, description, system_prompt: systemPrompt }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateAgent(id: string, name: string, description: string, systemPrompt: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/agents/${id}`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({ name, description, system_prompt: systemPrompt }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async deleteAgent(id: string): Promise<void> {
    const res = await fetch(`${this.hostUrl}/api/agents/${id}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  async updateDocumentCategory(id: string, category: string): Promise<void> {
    return invoke("update_document_category", { id, category });
  }

  async updateDocumentCollection(id: string, collectionId: string | null): Promise<void> {
    return invoke("update_document_collection", { id, collection_id: collectionId });
  }

  async factoryReset(): Promise<void> {
    throw new Error("factoryReset not implemented for thin client");
  }

  async getAllChunks(): Promise<VectorRecord[]> {
    throw new Error("getAllChunks not implemented for thin client");
  }

  async deleteChunk(_chunkId: string): Promise<void> {
    throw new Error("deleteChunk not implemented for thin client");
  }

  async updateChunk(_chunkId: string, _documentId: string, _text: string, _chunkIndex: number, _agentId?: string): Promise<void> {
    throw new Error("updateChunk not implemented for thin client");
  }

  async findSimilarChunks(_chunkText: string): Promise<SearchResult[]> {
    throw new Error("findSimilarChunks not implemented for thin client");
  }

  async getSkillFiles(_skillName: string): Promise<{ tool_json: string; handler_js: string }> {
    throw new Error("getSkillFiles not implemented for thin client");
  }

  async saveSkillFiles(_skillName: string, _toolJson: string, _handlerJs: string): Promise<void> {
    throw new Error("saveSkillFiles not implemented for thin client");
  }
}
