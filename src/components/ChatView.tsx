import React, { useRef, useEffect } from "react";
import { User, Bot, ImagePlus, X, Send, Download, Sparkles, ChevronRight } from "lucide-react";
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
      className="chat-main-wrapper"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDraggingOver && (
        <div className="drag-overlay">
          <div className="drag-overlay-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <span>Drop images to attach</span>
          </div>
        </div>
      )}

      {activeThreadId ? (
        <>
          <header className="chat-header" data-tauri-drag-region>
            <div className="chat-header-left" data-tauri-drag-region>
              <button
                className="sidebar-toggle-btn"
                onClick={onToggleSidebar}
                title={sidebarOpen ? "Hide Sidebar (Focus Mode)" : "Show Sidebar"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </button>
              <span className="chat-header-title">{activeThread?.title || "Conversation"}</span>
            </div>

            <div className="chat-header-actions">
              <button
                className="chat-header-action-btn"
                onClick={onExportChat}
                title="Export Chat Thread (Markdown / JSON)"
              >
                <Download size={14} />
                <span>Export</span>
              </button>

              <select
                className="chat-category-select"
                value={selectedCategoryFilter}
                onChange={(e) => onSelectCategoryFilter(e.target.value)}
                title="Filter Knowledge Base by Category"
              >
                <option value="auto">Auto (Agent Default)</option>
                <option value="Everything">Everything (Global Search)</option>
                {Array.from(new Set(documents.map(d => d.category).filter(Boolean))).map(cat => (
                  <option key={cat as string} value={cat as string}>Category: {cat}</option>
                ))}
              </select>

              <span className="chat-header-model-badge">
                <span className="badge-status-dot" />
                {selectedModel === "llama3.2:latest"
                  ? "Llama 3.2 (3B)"
                  : selectedModel === "llama3.1:latest"
                  ? "Llama 3.1 (8B)"
                  : selectedModel.split(":")[0]}
              </span>
            </div>
          </header>

          <div className="messages-list">
            {messages.length === 0 && !streamingText && (
              <div className="welcome-hero-card">
                <div className="welcome-logo-badge">
                  <Sparkles size={28} className="logo-sparkle-icon" />
                </div>
                <h2 className="welcome-title">PerSona Knowledge Assistant</h2>
                {ollamaStatus === "error" ? (
                  <div className="ollama-error-box">
                    <h3>⚠️ Ollama Not Detected</h3>
                    <p>PerSona requires a local Ollama instance running with at least one model downloaded.</p>
                    <ol>
                      <li>Install <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a></li>
                      <li>Run <code>ollama serve</code></li>
                      <li>Pull a model: <code>ollama run llama3.2</code></li>
                    </ol>
                    <button onClick={onRetryConnection} className="btn-primary" style={{ marginTop: '12px' }}>
                      Retry Connection
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="welcome-subtitle">
                      Your private, offline AI assistant. Ask anything about your indexed documents, files, and code.
                    </p>
                    <div className="welcome-prompts-grid">
                      {[
                        "Summarize the key points from my documents",
                        "What topics are covered in my knowledge base?",
                        "Find information about a specific concept",
                        "Compare ideas across different documents",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          className="welcome-prompt-card"
                          onClick={() => {
                            onSetInputText(prompt);
                            setTimeout(() => (document.querySelector('.chat-input-field') as HTMLTextAreaElement)?.focus(), 50);
                          }}
                        >
                          <span>{prompt}</span>
                          <ChevronRight size={14} className="prompt-card-arrow" />
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
                  {msg.role === "assistant" ? <Bot size={17} strokeWidth={2.2} /> : <User size={17} strokeWidth={2.2} />}
                </div>
                <div className="msg-body">
                  <div className="msg-content">
                    {msg.images && msg.images.length > 0 && (
                      <div className="msg-images-grid">
                        {msg.images.map((b64, idx) => (
                          <img key={idx} src={`data:image/jpeg;base64,${b64}`} alt="Attachment" />
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
                      <span className="citations-header">Sources &amp; References</span>
                      <div className="citations-container">
                        {msg.citations.map((cit: any) => {
                          const isUrl = cit.filepath?.startsWith('http');
                          const displayName = isUrl
                            ? (() => { try { return new URL(cit.filepath).hostname; } catch { return cit.filepath; } })()
                            : (cit.filepath?.split(/[/\\]/).pop() || cit.filename || 'Source');
                          return (
                            <span
                              key={cit.source_index}
                              className="citation-tag tooltip-container"
                              style={{ cursor: cit.document_id ? 'pointer' : 'default' }}
                              onClick={() => cit.document_id && onPreviewDocument(cit.document_id)}
                            >
                              <span className="citation-num">{cit.source_index}</span>
                              <span className="citation-name">{displayName.length > 28 ? displayName.slice(0, 26) + '…' : displayName}</span>
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

          {/* Floating Chat Input Bar */}
          <div className="chat-input-outer-container">
            <form className="chat-input-box" onSubmit={onSendMessage}>
              {selectedMentions.length > 0 && (
                <div className="mention-chips-row">
                  {selectedMentions.map(doc => (
                    <span key={doc.id} className="mention-chip">
                      @{doc.filepath.split(/[/\\]/).pop()}
                      <X size={12} className="remove-mention-btn" onClick={() => onRemoveMention(doc.id)} />
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
                  <div className="mention-header">Reference Document</div>
                  {allDocs
                    .filter(d => d.filepath.toLowerCase().includes(mentionQuery.toLowerCase()))
                    .slice(0, 5)
                    .map((doc, idx) => (
                      <div
                        key={doc.id}
                        className={`mention-item ${idx === mentionSelectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelectMention(doc)}
                      >
                        <span className="doc-icon">📄</span>
                        <span className="doc-name">{doc.filepath.split(/[/\\]/).pop()}</span>
                      </div>
                    ))}
                </div>
              )}

              <div className="input-textarea-wrapper">
                <label className="chat-icon-btn" title="Attach Image" style={{ cursor: 'pointer' }}>
                  <ImagePlus size={18} />
                  <input type="file" accept="image/*" multiple onChange={onAttachImages} style={{ display: 'none' }} />
                </label>
                <textarea
                  className="chat-input-field"
                  placeholder="Ask PerSona anything about your documents... (Type @ to reference)"
                  value={inputText}
                  onChange={onInputChange}
                  onKeyDown={onKeyDownInput}
                  rows={1}
                />
                <button
                  type="submit"
                  className="send-submit-btn"
                  disabled={isGenerating || (!inputText.trim() && attachedImages.length === 0)}
                  title="Send message (Enter)"
                >
                  <Send size={16} />
                </button>
              </div>

              <div className="input-bottom-bar">
                <div className="input-shortcut-hint">
                  Press <strong>Enter ↵</strong> to send • <strong>Shift + Enter</strong> for new line
                </div>
                <div className="input-engine-indicator">
                  <span className="engine-dot" />
                  <span>Ollama Local Engine</span>
                </div>
              </div>
            </form>
          </div>
        </>
      ) : (
        <div className="welcome-hero-card">
          <div className="welcome-logo-badge">
            <Sparkles size={28} className="logo-sparkle-icon" />
          </div>
          <h2 className="welcome-title">Welcome to PerSona</h2>
          <p className="welcome-subtitle">Select or create a conversation from the sidebar to begin.</p>
        </div>
      )}
    </div>
  );
};
