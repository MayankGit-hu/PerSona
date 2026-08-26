import React from "react";
import { Skill } from "../api_client";

interface SkillsViewProps {
  skills: Skill[];
  showAddSkill: boolean;
  newSkillName: string;
  newSkillDesc: string;
  newSkillSchema: string;
  newSkillCode: string;
  newSkillLang: string;
  rawEditorOpen: boolean;
  rawEditorSkillName: string;
  rawToolJson: string;
  rawHandlerJs: string;
  onToggleAddSkill: () => void;
  onSaveSkill: (e: React.FormEvent) => void;
  onDeleteSkill: (name: string) => void;
  onOpenRawEditor: (name: string) => void;
  onSaveRawSkill: () => void;
  onCloseRawEditor: () => void;
  onApproveSkill: (name: string) => void;
  setNewSkillName: (v: string) => void;
  setNewSkillDesc: (v: string) => void;
  setNewSkillSchema: (v: string) => void;
  setNewSkillCode: (v: string) => void;
  setNewSkillLang: (v: string) => void;
  setRawToolJson: (v: string) => void;
  setRawHandlerJs: (v: string) => void;
}

export const SkillsView: React.FC<SkillsViewProps> = ({
  skills,
  showAddSkill,
  newSkillName,
  newSkillDesc,
  newSkillSchema,
  newSkillCode,
  newSkillLang,
  rawEditorOpen,
  rawEditorSkillName,
  rawToolJson,
  rawHandlerJs,
  onToggleAddSkill,
  onSaveSkill,
  onDeleteSkill,
  onOpenRawEditor,
  onSaveRawSkill,
  onCloseRawEditor,
  onApproveSkill,
  setNewSkillName,
  setNewSkillDesc,
  setNewSkillSchema,
  setNewSkillCode,
  setNewSkillLang,
  setRawToolJson,
  setRawHandlerJs,
}) => {
  return (
    <div className="page-container">
      <header className="page-header">
        <h2 className="page-title">Skills Registry</h2>
        <p className="page-subtitle">Manage custom functions and MCP tools your agents can execute.</p>
      </header>

      <div className="page-section">
        <div className="page-section-title">Discovered Skills</div>
        <div className="skills-list" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {skills.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem', background: 'var(--bg-obsidian)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              No custom skills registered yet. Click below to synthesize or add one manually.
            </div>
          ) : (
            skills.map((skill) => (
              <div key={skill.name} className="skill-item" style={{ padding: "16px", borderRadius: "8px", background: "var(--bg-obsidian)", border: "1px solid var(--border-light)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div className="skill-name" style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                      {skill.name}
                      <span className="skill-badge" style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(139, 92, 246, 0.2)", color: "var(--accent-violet)", fontWeight: 500 }}>
                        MCP Tool
                      </span>
                      {skill.approved === false && (
                        <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "4px", background: "rgba(239, 68, 68, 0.2)", color: "#ef4444", fontWeight: 500 }}>
                          Unapproved
                        </span>
                      )}
                    </div>
                  </div>
                  {skill.name !== "synthesize_skill" && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => onOpenRawEditor(skill.name)} title="Edit Raw Code" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                      </button>
                      <button onClick={() => onDeleteSkill(skill.name)} title="Delete Skill" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="skill-desc" style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>{skill.description}</div>

                {skill.approved === false && (
                  <div style={{ marginTop: '12px', padding: '12px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '0.8rem', color: '#fca5a5', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                      <strong>Security Notice:</strong> This skill runs a script locally on your computer. Review the code carefully before approving.
                    </div>
                    <pre style={{ margin: 0, padding: '12px', backgroundColor: '#0f0f0f', borderRadius: '6px', overflowX: 'auto', fontSize: '0.8rem', fontFamily: 'monospace', color: '#34d399', maxHeight: '200px', border: '1px solid #27272a' }}>
                      <code>{skill.code}</code>
                    </pre>
                    <button
                      onClick={() => onApproveSkill(skill.name)}
                      className="btn-primary"
                      style={{ marginTop: '12px', background: '#10b981', color: '#022c22' }}
                    >
                      Approve Skill Execution
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="page-section" style={{ background: "transparent", border: "none", padding: "0" }}>
        <button
          className="btn-secondary"
          onClick={onToggleAddSkill}
          style={{ width: "100%", padding: "16px", borderStyle: "dashed" }}
        >
          {showAddSkill ? "Cancel" : "+ Create Custom Skill"}
        </button>

        {showAddSkill && (
          <div className="page-section" style={{ marginTop: "16px" }}>
            <div className="page-section-title">New Skill</div>
            <form onSubmit={onSaveSkill} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Skill Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. compound_interest"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Computes interest metrics"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Arguments Schema (JSON)</label>
                <textarea
                  className="form-textarea"
                  placeholder='{"principal":"number","rate":"number","years":"number"}'
                  value={newSkillSchema}
                  onChange={(e) => setNewSkillSchema(e.target.value)}
                  rows={2}
                  required
                  style={{ fontFamily: "monospace" }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Language</label>
                <select className="form-input" value={newSkillLang} onChange={(e) => setNewSkillLang(e.target.value)}>
                  <option value="javascript">JavaScript (Node.js)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Script Code</label>
                <p className="form-hint" style={{ marginTop: "-4px", marginBottom: "4px" }}>The script receives arguments as stringified JSON in <code>process.argv[2]</code>.</p>
                <textarea
                  className="form-textarea"
                  placeholder="const args = JSON.parse(process.argv[2]);\nconsole.log('Result:', args);"
                  value={newSkillCode}
                  onChange={(e) => setNewSkillCode(e.target.value)}
                  rows={8}
                  required
                  style={{ fontFamily: "monospace" }}
                />
              </div>
              <button type="submit" className="btn-primary" style={{ alignSelf: "flex-start" }}>
                Save Skill
              </button>
            </form>
          </div>
        )}
      </div>

      {rawEditorOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-obsidian)', border: '1px solid var(--border-light)', borderRadius: '12px', width: '700px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>Skill Code Editor — {rawEditorSkillName}</h3>
              <button onClick={onCloseRawEditor} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>tool.json (MCP Manifest)</label>
                <textarea
                  value={rawToolJson}
                  onChange={e => setRawToolJson(e.target.value)}
                  style={{ width: '100%', height: '140px', backgroundColor: '#0f0f0f', border: '1px solid var(--border-light)', borderRadius: '6px', color: '#e4e4e7', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>handler.js / handler.py</label>
                <textarea
                  value={rawHandlerJs}
                  onChange={e => setRawHandlerJs(e.target.value)}
                  style={{ width: '100%', height: '220px', backgroundColor: '#0f0f0f', border: '1px solid var(--border-light)', borderRadius: '6px', color: '#34d399', fontFamily: 'monospace', fontSize: '0.85rem', padding: '10px' }}
                />
              </div>
            </div>
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
              <button onClick={onCloseRawEditor} className="btn-secondary">Cancel</button>
              <button onClick={onSaveRawSkill} className="btn-primary">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
