import React, { useRef, useEffect } from "react";
import { User, Bot, ImagePlus, X } from "lucide-react";
import { Thread, Document } from "../api_client";
import { MarkdownMessage } from "./MarkdownMessage";
import { StreamingBubble, Citation } from "./StreamingBubble";

export interface Message {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  created_at: string;
  images?: string[];
  citations?: Citation[];
}

interface ChatViewProps {
  activeThreadId: string | null;
  threads: Thread[];
  messages: Message[];
  documents: Document[];
  selectedCategoryFilter: string;
  selectedModel: string;
  ollamaStatus: "checking" | "ok" | "error";
  streamingText: string;
  streamingCitations: Citation[];
  agentStepsText: string;
  isGenerating: boolean;
  inputText: string;
  attachedImages: string[];
  selectedMentions: Document[];
  mentionOpen: boolean;
  mentionQuery: string;
  mentionSelectedIndex: number;
  allDocs: Document[];
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onExportChat: () => void;
  onSelectCategoryFilter: (val: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
  onSetInputText: (val: string) => void;
  onAttachImages: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
  onRemoveMention: (id: string) => void;
  onSelectMention: (doc: Document) => void;
  onKeyDownInput: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onRetryConnection: () => void;
  onPreviewDocument: (id: string) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isDraggingOver: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({
  activeThreadId,
  threads,
  messages,
  documents,
  selectedCategoryFilter,
  selectedModel,
  ollamaStatus,
  streamingText,
  streamingCitations,
  agentStepsText,
  isGenerating,
  inputText,
  attachedImages,
  selectedMentions,
  mentionOpen,
  mentionQuery,
  mentionSelectedIndex,
  allDocs,
  sidebarOpen,
  onToggleSidebar,
  onExportChat,
  onSelectCategoryFilter,
  onSendMessage,
  onSetInputText,
  onAttachImages,
  onRemoveImage,
  onRemoveMention,
  onSelectMention,
  onKeyDownInput,
  onInputChange,
  onRetryConnection,
  onPreviewDocument,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  isDraggingOver,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, agentStepsText]);

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden", position: "relative" }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDraggingOver && (
        <div
          style={{
            position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(124, 58, 237, 0.1)",
            backdropFilter: "blur(4px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px dashed var(--accent-violet)",
            borderRadius: "8px",
            margin: "16px"
          }}
        >
          <div style={{ color: "var(--accent-violet)", fontSize: "1.2rem", fontWeight: 600, display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            Drop images to attach
          </div>
        </div>
      )}

      {activeThreadId ? (
        <>
          <header className="chat-header" data-tauri-drag-region>
            <span className="chat-header-title" data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="sidebar-toggle-btn"
                onClick={onToggleSidebar}
                title={sidebarOpen ? "Hide Sidebar (Focus Mode)" : "Show Sidebar"}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </button>
              {activeThread?.title || "Active Chat"}
            </span>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <button
                className="sidebar-tab-btn"
                onClick={onExportChat}
                title="Export Chat Thread"
                style={{ padding: "4px 8px", height: "auto", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Export
              </button>
              <select
                value={selectedCategoryFilter}
                onChange={(e) => onSelectCategoryFilter(e.target.value)}
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: selectedCategoryFilter !== "auto" ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.1)",
                  color: "white",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "0.8rem",
                  outline: "none"
                }}
                title="Filter Knowledge Base by Category"
              >
                <option value="auto">Auto (Agent Default)</option>
                <option value="Everything">Everything (Global Search)</option>
                {Array.from(new Set(documents.map(d => d.category).filter(Boolean))).map(cat => (
                  <option key={cat as string} value={cat as string}>Category: {cat}</option>
                ))}
              </select>
              <span className="chat-header-model">
                {selectedModel === "llama3.2:latest"
                  ? "Llama 3.2 - 3B Parameters"
                  : selectedModel === "llama3.1:latest"
                  ? "Llama 3.1 - 8B Parameters"
                  : selectedModel}
              </span>
            </div>
          </header>

          <div className="messages-list">
            {messages.length === 0 && !streamingText && (
              <div className="welcome-screen">
                <h2 className="welcome-logo">PerSona</h2>
                {ollamaStatus === "error" ? (
                  <div style={{ padding: '20px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', marginBottom: '20px', color: '#fca5a5', maxWidth: '440px' }}>
                    <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                      ⚠️ Ollama Not Detected
                    </h3>
                    <p style={{ fontSize: '0.875rem', lineHeight: '1.6', color: '#fca5a5' }}>
                      PerSona requires Ollama to be running locally with at least one model downloaded.
                    </p>
                    <ul style={{ textAlign: 'left', marginTop: '10px', fontSize: '0.82rem', paddingLeft: '18px', color: '#fca5a5' }}>
                      <li>1. Install <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>Ollama</a></li>
                      <li>2. Start it (<code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>ollama serve</code>)</li>
                      <li>3. Pull a model (<code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>ollama run llama3.2</code>)</li>
                    </ul>
                    <button onClick={onRetryConnection} className="new-chat-btn" style={{ marginTop: '15px' }}>
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="welcome-subtitle">
                      Your private, offline AI assistant. Ask anything about your knowledge base.
                    </p>
                    <div className="welcome-suggestions">
                      {[
                        "Summarize the key points from my documents",
                        "What topics are covered in my knowledge base?",
                        "Find information about a specific concept",
                        "Compare ideas across different documents",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          className="suggestion-chip"
                          onClick={() => {
                            onSetInputText(prompt);
                            setTimeout(() => (document.querySelector('.chat-input-field') as HTMLTextAreaElement)?.focus(), 50);
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`msg-row ${msg.role}`}>
                <div className="msg-avatar">
                  {msg.role === "assistant" ? <Bot size={18} strokeWidth={2.5} /> : <User size={18} strokeWidth={2.5} />}
                </div>
                <div className="msg-body">
                  <div className="msg-content">
                    {msg.images && msg.images.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        {msg.images.map((b64, idx) => (
                          <img key={idx} src={`data:image/jpeg;base64,${b64}`} style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '8px' }} alt="User attachment" />
                        ))}
                      </div>
                    )}
                    <MarkdownMessage content={
                      msg.content.replace(
                        /(?:<|&lt;)antArtifact\s+([^>]*?)(?:>|&gt;)([\s\S]*?)(?:(?:<|&lt;)\/antArtifact(?:>|&gt;)|$)/gi,
                        (_fullMatch, attrs) => {
                          const getAttr = (name: string) => {
                            const match = new RegExp(`${name}=(?:["'\\\\]+([^"'\\\\\\s>]+)["'\\\\]+|([^"\\\\\\s>]+))`, 'i').exec(attrs);
                            return match ? (match[1] || match[2]) : null;
                          };
                          const title = getAttr('title') || 'Generated Artifact';
                          return `\n\n> 📦 **Artifact Created:** \`${title}\`.\n\n`;
                        }
                      )
                    } />
                  </div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="citations-list">
                      <span className="citations-header">Sources</span>
                      <div className="citations-container" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
                        {msg.citations.map((cit: any) => {
                          const isUrl = cit.filepath?.startsWith('http');
                          const displayName = isUrl
                            ? (() => { try { return new URL(cit.filepath).hostname; } catch { return cit.filepath; } })()
                            : (cit.filepath?.split(/[/\\]/).pop() || cit.filename || 'Unknown');
                          return (
                            <span
                              key={cit.source_index}
                              className="citation-tag tooltip-container"
                              style={{ cursor: cit.document_id ? 'pointer' : 'default' }}
                              onClick={() => cit.document_id && onPreviewDocument(cit.document_id)}
                            >
                              <span className="citation-num">{cit.source_index}</span>
                              {displayName.length > 28 ? displayName.slice(0, 26) + '…' : displayName}
                              <span className="citation-tooltip">
                                <div className="citation-tooltip-file">{cit.filename || cit.filepath}</div>
                                <div>{cit.text}</div>
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {(streamingText || isGenerating || agentStepsText) && (
              <StreamingBubble
                text={streamingText}
                citations={streamingCitations}
                isGenerating={isGenerating}
                agentStepsText={agentStepsText}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-box" onSubmit={onSendMessage}>
            {selectedMentions.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '6px 12px', borderBottom: '1px solid var(--border-light)', backgroundColor: 'rgba(139, 92, 246, 0.05)' }}>
                {selectedMentions.map(doc => (
                  <span key={doc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--accent-violet)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500 }}>
                    @{doc.filepath.split(/[/\\]/).pop()}
                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => onRemoveMention(doc.id)} />
                  </span>
                ))}
              </div>
            )}

            {attachedImages.length > 0 && (
              <div className="image-attachments-preview">
                {attachedImages.map((b64, idx) => (
                  <div key={idx} className="image-preview-thumb">
                    <img src={`data:image/jpeg;base64,${b64}`} alt="Attachment" />
                    <button type="button" className="remove-img-btn" onClick={() => onRemoveImage(idx)}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {mentionOpen && (
              <div className="mention-dropdown">
                {allDocs
                  .filter(d => d.filepath.toLowerCase().includes(mentionQuery.toLowerCase()))
                  .slice(0, 5)
                  .map((doc, idx) => (
                    <div
                      key={doc.id}
                      className={`mention-item ${idx === mentionSelectedIndex ? 'selected' : ''}`}
                      onClick={() => onSelectMention(doc)}
                    >
                      📄 {doc.filepath.split(/[/\\]/).pop()}
                    </div>
                  ))}
              </div>
            )}

            <div className="input-textarea-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label className="icon-btn" title="Attach Image" style={{ cursor: 'pointer' }}>
                <ImagePlus size={18} />
                <input type="file" accept="image/*" multiple onChange={onAttachImages} style={{ display: 'none' }} />
              </label>
              <textarea
                className="chat-input-field"
                placeholder="Ask PerSona... (Type @ to reference documents)"
                value={inputText}
                onChange={onInputChange}
                onKeyDown={onKeyDownInput}
                rows={1}
              />
              <button
                type="submit"
                className="btn-primary send-btn"
                disabled={isGenerating || (!inputText.trim() && attachedImages.length === 0)}
              >
                Send
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="welcome-screen">
          <h2 className="welcome-logo">PerSona</h2>
          <p className="welcome-subtitle">Select or create a conversation from the sidebar to get started.</p>
        </div>
      )}
    </div>
  );
};
