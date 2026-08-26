import React from "react";

interface SettingsViewProps {
  runtimeSettings: {
    ollama_base_url: string;
    ollama_num_gpu: number;
    ollama_num_ctx: number;
    embedding_model: string;
    llm_parsing_enabled: boolean;
    llm_parsing_model: string;
    serper_api_key: string;
    openai_api_key: string;
    anthropic_api_key: string;
  };
  settingsSaved: boolean;
  syncDirectory: string | null;
  ollamaStatus: "checking" | "ok" | "error";
  hostInfo: { ip: string; port: number; passcode: string; is_running: boolean };
  connectionMode: "local" | "remote";
  remoteIp: string;
  remotePort: number;
  remotePasscode: string;
  confirmFactoryReset: boolean;
  onSaveRuntimeSettings: (e: React.FormEvent) => void;
  onSelectSyncDirectory: () => void;
  onClearSyncDirectory: () => void;
  onToggleHostServer: () => void;
  onSaveConnectionSettings: (e: React.FormEvent) => void;
  onFactoryReset: () => void;
  setRuntimeSettings: React.Dispatch<React.SetStateAction<{
    ollama_base_url: string;
    ollama_num_gpu: number;
    ollama_num_ctx: number;
    embedding_model: string;
    llm_parsing_enabled: boolean;
    llm_parsing_model: string;
    serper_api_key: string;
    openai_api_key: string;
    anthropic_api_key: string;
  }>>;
  setConnectionMode: (mode: "local" | "remote") => void;
  setRemoteIp: (v: string) => void;
  setRemotePort: (v: number) => void;
  setRemotePasscode: (v: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  runtimeSettings,
  settingsSaved,
  syncDirectory,
  ollamaStatus,
  hostInfo,
  connectionMode,
  remoteIp,
  remotePort,
  remotePasscode,
  confirmFactoryReset,
  onSaveRuntimeSettings,
  onSelectSyncDirectory,
  onClearSyncDirectory,
  onToggleHostServer,
  onSaveConnectionSettings,
  onFactoryReset,
  setRuntimeSettings,
  setConnectionMode,
  setRemoteIp,
  setRemotePort,
  setRemotePasscode,
}) => {
  return (
    <div className="page-container">
      <header className="page-header">
        <h2 className="page-title">Runtime & Provider Settings</h2>
        <p className="page-subtitle">Configure model options, API keys, watched directories, and remote pairing.</p>
      </header>

      {/* Ollama Health Indicator */}
      <div className="page-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-section-title" style={{ margin: 0 }}>Ollama Connection Status</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {runtimeSettings.ollama_base_url}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          {ollamaStatus === "checking" && <span style={{ color: '#eab308' }}>⏳ Checking...</span>}
          {ollamaStatus === "ok" && <span style={{ color: '#10b981' }}>● Online</span>}
          {ollamaStatus === "error" && <span style={{ color: '#ef4444' }}>○ Offline</span>}
        </div>
      </div>

      {/* Watched Directory */}
      <div className="page-section">
        <div className="page-section-title">Watched Folder (Auto-Ingest)</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="text"
            className="form-input"
            value={syncDirectory || "No folder watched"}
            readOnly
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}
          />
          <button onClick={onSelectSyncDirectory} className="btn-secondary">
            Select Folder
          </button>
          {syncDirectory && (
            <button onClick={onClearSyncDirectory} className="btn-secondary" style={{ color: '#ef4444' }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Runtime Configuration */}
      <div className="page-section">
        <div className="page-section-title">Ollama & Embedding Configuration</div>
        <form onSubmit={onSaveRuntimeSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Ollama Base URL</label>
            <input
              type="text"
              className="form-input"
              value={runtimeSettings.ollama_base_url}
              onChange={(e) => setRuntimeSettings(s => ({ ...s, ollama_base_url: e.target.value }))}
              placeholder="http://localhost:11434"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">GPU Offload Layers (num_gpu)</label>
              <input
                type="number"
                className="form-input"
                value={runtimeSettings.ollama_num_gpu}
                onChange={(e) => setRuntimeSettings(s => ({ ...s, ollama_num_gpu: Number(e.target.value) }))}
              />
              <span className="form-hint">-1 for auto, 0 for CPU only</span>
            </div>

            <div className="form-group">
              <label className="form-label">Context Window (num_ctx)</label>
              <input
                type="number"
                className="form-input"
                value={runtimeSettings.ollama_num_ctx}
                onChange={(e) => setRuntimeSettings(s => ({ ...s, ollama_num_ctx: Number(e.target.value) }))}
                required
              />
              <span className="form-hint">Default: 4096 tokens</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Embedding Model</label>
            <input
              type="text"
              className="form-input"
              value={runtimeSettings.embedding_model}
              onChange={(e) => setRuntimeSettings(s => ({ ...s, embedding_model: e.target.value }))}
              placeholder="nomic-embed-text:latest"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">OpenAI API Key (Optional)</label>
            <input
              type="password"
              className="form-input"
              placeholder="sk-..."
              value={runtimeSettings.openai_api_key}
              onChange={(e) => setRuntimeSettings(s => ({ ...s, openai_api_key: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Anthropic API Key (Optional)</label>
            <input
              type="password"
              className="form-input"
              placeholder="sk-ant-..."
              value={runtimeSettings.anthropic_api_key}
              onChange={(e) => setRuntimeSettings(s => ({ ...s, anthropic_api_key: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn-primary" style={{ alignSelf: 'flex-start' }}>
            {settingsSaved ? "Saved ✓" : "Save Configuration"}
          </button>
        </form>
      </div>

      {/* Host Server */}
      <div className="page-section">
        <div className="page-section-title">Host Server (Desktop)</div>
        <div style={{ background: 'var(--bg-obsidian)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <div className="form-hint">Local IP</div>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>{hostInfo.ip}</div>
            </div>
            <div>
              <div className="form-hint">Port</div>
              <div style={{ fontWeight: 500, marginTop: '2px' }}>{hostInfo.port}</div>
            </div>
            <div>
              <div className="form-hint">Passcode</div>
              <div style={{ fontWeight: 500, marginTop: '2px', fontFamily: 'monospace', letterSpacing: '1px', color: 'var(--accent-violet)' }}>{hostInfo.passcode || "None"}</div>
            </div>
            <div>
              <div className="form-hint">Status</div>
              <div style={{ fontWeight: 600, marginTop: '2px', color: hostInfo.is_running ? '#10b981' : '#f43f5e' }}>
                {hostInfo.is_running ? "● Running" : "○ Stopped"}
              </div>
            </div>
          </div>
          <button
            className={hostInfo.is_running ? "btn-secondary" : "btn-primary"}
            onClick={onToggleHostServer}
            style={{ width: '100%' }}
          >
            {hostInfo.is_running ? "Stop Desktop Host" : "Start Desktop Host"}
          </button>
        </div>
      </div>

      {/* Connection Mode */}
      <div className="page-section">
        <div className="page-section-title">Connection Mode</div>
        <form onSubmit={onSaveConnectionSettings} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--bg-obsidian)', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
            <button
              type="button"
              className={`sidebar-tab-btn ${connectionMode === "local" ? "active" : ""}`}
              style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, border: connectionMode === "local" ? '1px solid var(--accent-violet)' : '1px solid transparent' }}
              onClick={() => setConnectionMode("local")}
            >
              Local Mode
            </button>
            <button
              type="button"
              className={`sidebar-tab-btn ${connectionMode === "remote" ? "active" : ""}`}
              style={{ flex: 1, padding: '8px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: 500, border: connectionMode === "remote" ? '1px solid var(--accent-violet)' : '1px solid transparent' }}
              onClick={() => setConnectionMode("remote")}
            >
              Thin Client
            </button>
          </div>

          {connectionMode === "remote" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Remote Host IP</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 192.168.1.50"
                  value={remoteIp}
                  onChange={(e) => setRemoteIp(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Port</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="default: 11430"
                  value={remotePort}
                  onChange={(e) => setRemotePort(Number(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Passcode</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Optional secure passcode"
                  value={remotePasscode}
                  onChange={(e) => setRemotePasscode(e.target.value)}
                />
              </div>
            </div>
          )}

          <button type="submit" className="btn-primary" style={{ width: 'fit-content' }}>
            Apply Connection Settings
          </button>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="page-section page-section-danger">
        <div className="page-section-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>Danger Zone</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p className="form-hint" style={{ margin: 0, fontSize: '0.85rem', color: '#fca5a5' }}>
            <strong>Factory Reset</strong> wipes everything — documents, agents, chat history, and all settings. This action cannot be undone.
          </p>
          <button
            type="button"
            className="btn-danger"
            style={{ width: 'fit-content' }}
            onClick={onFactoryReset}
          >
            {confirmFactoryReset ? "⚠️ Click again to permanently delete EVERYTHING" : "Factory Reset All Data"}
          </button>
        </div>
      </div>
    </div>
  );
};
