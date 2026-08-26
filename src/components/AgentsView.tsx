import React from "react";
import { Agent, Skill } from "../api_client";

interface AgentsViewProps {
  agents: Agent[];
  activeAgentId: string | null;
  skills: Skill[];
  showAddAgent: boolean;
  editingAgentId: string | null;
  newAgentName: string;
  newAgentDesc: string;
  newAgentPrompt: string;
  newAgentSkills: string[];
  newAgentDefaultCategory: string;
  onSelectAgent: (id: string | null) => void;
  onToggleAddAgent: () => void;
  onEditAgent: (agent: Agent) => void;
  onDeleteAgent: (id: string) => void;
  onSaveAgent: (e: React.FormEvent) => void;
  setNewAgentName: (v: string) => void;
  setNewAgentDesc: (v: string) => void;
  setNewAgentPrompt: (v: string) => void;
  setNewAgentSkills: (v: string[] | ((prev: string[]) => string[])) => void;
  setNewAgentDefaultCategory: (v: string) => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  activeAgentId,
  skills,
  showAddAgent,
  editingAgentId,
  newAgentName,
  newAgentDesc,
  newAgentPrompt,
  newAgentSkills,
  newAgentDefaultCategory,
  onSelectAgent,
  onToggleAddAgent,
  onEditAgent,
  onDeleteAgent,
  onSaveAgent,
  setNewAgentName,
  setNewAgentDesc,
  setNewAgentPrompt,
  setNewAgentSkills,
  setNewAgentDefaultCategory,
}) => {
  return (
    <div className="page-container">
      <header className="page-header">
        <h2 className="page-title">Custom Agents</h2>
        <p className="page-subtitle">Configure specialized AI agents with specific instructions and skills.</p>
      </header>

      <div className="page-section">
        <div className="page-section-title">Your Agents</div>
        <div className="agents-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            className={`agent-item ${activeAgentId === null ? "active" : ""}`}
            onClick={() => onSelectAgent(null)}
            style={{
              padding: "16px",
              borderRadius: "8px",
              background: activeAgentId === null ? "rgba(139, 92, 246, 0.15)" : "var(--bg-obsidian)",
              border: `1px solid ${activeAgentId === null ? "var(--accent-violet)" : "var(--border-light)"}`,
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}
          >
            <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-main)" }}>PerSona (Default)</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>The default knowledge assistant.</div>
          </div>

          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`agent-item ${activeAgentId === agent.id ? "active" : ""}`}
              onClick={() => onSelectAgent(agent.id)}
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: activeAgentId === agent.id ? "rgba(139, 92, 246, 0.15)" : "var(--bg-obsidian)",
                border: `1px solid ${activeAgentId === agent.id ? "var(--accent-violet)" : "var(--border-light)"}`,
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-main)" }}>{agent.name}</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{agent.description}</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditAgent(agent);
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "8px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseOver={(e) => e.currentTarget.style.color = 'var(--text-main)'}
                  onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title="Edit Agent"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAgent(agent.id);
                  }}
                  style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "8px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title="Delete Agent"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-section" style={{ background: "transparent", border: "none", padding: "0" }}>
        <button
          className={`btn-dashed-cta ${showAddAgent ? 'cancel' : ''}`}
          onClick={onToggleAddAgent}
        >
          {showAddAgent ? '✕ Cancel' : '+ Create Custom Agent'}
        </button>

        {showAddAgent && (
          <div className="page-section" style={{ marginTop: "16px" }}>
            <div className="page-section-title">{editingAgentId ? "Edit Agent" : "New Agent Configuration"}</div>
            <form onSubmit={onSaveAgent} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Agent Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Coding Assistant"
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Expert in Rust & React refactoring"
                  value={newAgentDesc}
                  onChange={(e) => setNewAgentDesc(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">System Instructions Prompt</label>
                <textarea
                  className="form-textarea"
                  placeholder="Define how this agent behaves, its tone, rules, and domain expertise..."
                  value={newAgentPrompt}
                  onChange={(e) => setNewAgentPrompt(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Default Document Category Filter (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Engineering (leave empty to search all documents)"
                  value={newAgentDefaultCategory}
                  onChange={(e) => setNewAgentDefaultCategory(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Assigned Skills</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {skills.length === 0 ? (
                    <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No skills registered yet.</span>
                  ) : (
                    skills.map((s) => {
                      const isChecked = newAgentSkills.includes(s.name);
                      return (
                        <label key={s.name} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem" }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewAgentSkills(prev => [...prev, s.name]);
                              } else {
                                setNewAgentSkills(prev => prev.filter(x => x !== s.name));
                              }
                            }}
                          />
                          <span>{s.name}</span>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>— {s.description}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ alignSelf: "flex-start" }}>
                {editingAgentId ? "Save Agent Changes" : "Create Agent"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
