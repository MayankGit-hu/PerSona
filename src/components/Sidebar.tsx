import React from "react";
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
}) => {
  return (
    <aside className="sidebar" style={{ width: sidebarWidth, flexShrink: 0 }}>
      <div className="sidebar-section-title">Conversations</div>
      <div className="threads-container">
        {threads.map((t) => (
          <div
            key={t.id}
            className={`thread-item ${activeThreadId === t.id && !activeTab ? "active" : ""}`}
            onClick={() => onSelectThread(t.id)}
            tabIndex={0}
            role="button"
            aria-label={`Conversation: ${t.title}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectThread(t.id);
              }
            }}
          >
            <span className="thread-title">{t.title}</span>
            <button
              className="delete-thread-btn"
              onClick={(e) => onDeleteThread(t.id, e)}
              title="Delete Conversation"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab-btn ${activeTab === "agents" ? "active" : ""}`}
          onClick={() => onSelectTab("agents")}
          data-tooltip="Agents"
          title="Agents"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
        </button>
        <button
          className={`sidebar-tab-btn ${activeTab === "collections" ? "active" : ""}`}
          onClick={() => onSelectTab("collections")}
          data-tooltip="Collections"
          title="Collections"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><path d="M12 11v6"></path><path d="M9 14h6"></path></svg>
        </button>
        <button
          className={`sidebar-tab-btn ${activeTab === "knowledge" ? "active" : ""}`}
          onClick={() => onSelectTab("knowledge")}
          data-tooltip="Knowledge"
          title="Knowledge Base"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </button>

        <button
          className={`sidebar-tab-btn ${activeTab === "skills" ? "active" : ""}`}
          onClick={() => onSelectTab("skills")}
          data-tooltip="Skills"
          title="Skill Library"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        </button>
        <button
          className={`sidebar-tab-btn ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => onSelectTab("settings")}
          data-tooltip="Settings"
          title="Settings"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        </button>
      </div>

      <div
        className="sidebar-resizer"
        onMouseDown={onStartResizing}
      />

      <div className="model-selector-section">
        <div className="model-selector-label">Runtime Provider Model</div>
        {availableModels.length <= 2 ? (
          <div className="model-toggle-container">
            {availableModels.map((model) => (
              <button
                key={model}
                className={`model-toggle-btn ${selectedModel === model ? "active" : ""}`}
                onClick={() => onSelectModel(model)}
              >
                {model.includes("llama3.2") ? "Llama 3.2 (CPU)" : model.includes("llama3.1") ? "Llama 3.1 (GPU)" : model.split(":")[0]}
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
