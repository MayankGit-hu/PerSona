import React from "react";
import { MessageSquare, Database, Folder, Users, Sparkles, Settings, Plus, Trash2 } from "lucide-react";
import { Thread } from "../api_client";

interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  activeTab: "knowledge" | "brain" | "skills" | "settings" | "agents" | "collections" | null;
  sidebarWidth: number;
  availableModels: string[];
  selectedModel: string;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  onSelectTab: (tab: "knowledge" | "brain" | "skills" | "settings" | "agents" | "collections" | null) => void;
  onSelectModel: (model: string) => void;
  onStartResizing: () => void;
  onNewChat?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  activeThreadId,
  activeTab,
  sidebarWidth,
  availableModels,
  selectedModel,
  onSelectThread,
  onDeleteThread,
  onSelectTab,
  onSelectModel,
  onStartResizing,
  onNewChat,
}) => {
  return (
    <aside className="sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
      {/* Primary Navigation Menu */}
      <div className="sidebar-nav-section">
        <div className="nav-item-btn-group">
          <button
            className={`nav-menu-btn ${!activeTab ? "active" : ""}`}
            onClick={() => onSelectTab(null)}
          >
            <MessageSquare size={16} />
            <span>Chat &amp; RAG</span>
          </button>
          <button
            className={`nav-menu-btn ${activeTab === "knowledge" ? "active" : ""}`}
            onClick={() => onSelectTab("knowledge")}
          >
            <Database size={16} />
            <span>Knowledge Base</span>
          </button>
          <button
            className={`nav-menu-btn ${activeTab === "collections" ? "active" : ""}`}
            onClick={() => onSelectTab("collections")}
          >
            <Folder size={16} />
            <span>Collections</span>
          </button>
          <button
            className={`nav-menu-btn ${activeTab === "agents" ? "active" : ""}`}
            onClick={() => onSelectTab("agents")}
          >
            <Users size={16} />
            <span>Agents</span>
          </button>
          <button
            className={`nav-menu-btn ${activeTab === "skills" ? "active" : ""}`}
            onClick={() => onSelectTab("skills")}
          >
            <Sparkles size={16} />
            <span>Skill Studio</span>
          </button>
          <button
            className={`nav-menu-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => onSelectTab("settings")}
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </div>
      </div>

      <div className="sidebar-divider" />

      {/* Conversations Section */}
      <div className="conversations-header">
        <span className="sidebar-section-title" style={{ margin: 0 }}>Recent Chats</span>
        {onNewChat && (
          <button className="new-chat-icon-btn" onClick={onNewChat} title="Create New Chat">
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="threads-container">
        {threads.length === 0 ? (
          <div className="empty-threads-notice">No conversations yet</div>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              className={`thread-item ${activeThreadId === t.id && !activeTab ? "active" : ""}`}
              onClick={() => {
                onSelectTab(null);
                onSelectThread(t.id);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Conversation: ${t.title}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(null);
                  onSelectThread(t.id);
                }
              }}
            >
              <MessageSquare size={13} className="thread-icon" />
              <span className="thread-title">{t.title}</span>
              <button
                className="delete-thread-btn"
                onClick={(e) => onDeleteThread(t.id, e)}
                title="Delete Conversation"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-resizer" onMouseDown={onStartResizing} />

      {/* Runtime Model Selector Section */}
      <div className="model-selector-section">
        <div className="model-selector-header">
          <span className="status-indicator-dot online" />
          <span className="model-selector-label">Runtime LLM Model</span>
        </div>
        {availableModels.length <= 2 ? (
          <div className="model-toggle-container">
            {availableModels.map((model) => (
              <button
                key={model}
                className={`model-toggle-btn ${selectedModel === model ? "active" : ""}`}
                onClick={() => onSelectModel(model)}
              >
                {model.includes("llama3.2") ? "Llama 3.2 (3B)" : model.includes("llama3.1") ? "Llama 3.1 (8B)" : model.split(":")[0]}
              </button>
            ))}
          </div>
        ) : (
          <select
            className="model-select-dropdown"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
          >
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        )}
      </div>
    </aside>
  );
};
