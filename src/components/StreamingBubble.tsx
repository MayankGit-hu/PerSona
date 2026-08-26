import React, { useState, useEffect, useRef } from 'react';
import { useThrottle } from '../hooks/useThrottle';
import { MarkdownMessage } from './MarkdownMessage';
import { Artifact } from '../api_client';
import { Bot } from 'lucide-react';

export interface Citation {
  source_index: number;
  filename: string;
  filepath: string;
  document_id: string;
  text: string;
}

interface StreamingBubbleProps {
  rawText?: string;
  text?: string;
  agentStepsText: string;
  isGenerating: boolean;
  citations: Citation[];
  onCitationClick?: (documentId: string) => void;
  onArtifactFound?: (artifact: Artifact) => void;
}

export const StreamingBubble: React.FC<StreamingBubbleProps> = React.memo(
  ({ rawText, text, agentStepsText, isGenerating, citations, onCitationClick, onArtifactFound }) => {
    const contentText = text ?? rawText ?? "";
    const displayText = useThrottle(contentText, 80);
    const [thinkingExpanded, setThinkingExpanded] = useState(true);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const startTimeRef = useRef<number>(Date.now());
    const stepsRef = useRef<HTMLDivElement>(null);

    // Track elapsed time while generating
    useEffect(() => {
      if (!isGenerating) return;
      startTimeRef.current = Date.now();
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }, [isGenerating]);

    // Auto-collapse thinking block once we have a real answer coming in
    useEffect(() => {
      if (displayText && displayText.length > 10 && thinkingExpanded) {
        setThinkingExpanded(false);
      }
    }, [displayText]);

    // Auto-scroll to latest thinking text
    useEffect(() => {
      if (stepsRef.current && isGenerating) {
        stepsRef.current.scrollTop = stepsRef.current.scrollHeight;
      }
    }, [agentStepsText]);

    const hasThought = !!agentStepsText;
    const isDoneThinking = hasThought && !!displayText;
    const thoughtDuration = Math.max(elapsedSeconds, 1);

    // Parse artifacts from the display text
    const { artifacts, cleanText } = React.useMemo(() => {
      const parsedArtifacts: Artifact[] = [];
      // Handle both raw <antArtifact> and HTML-escaped &lt;antArtifact&gt;
      // The closing tag is optional (|$), so it matches and streams in real-time!
      const regex = /(?:<|&lt;)antArtifact\s+([^>]*?)(?:>|&gt;)([\s\S]*?)(?:(?:<|&lt;)\/antArtifact(?:>|&gt;)|$)/gi;
      
      const cleanText = displayText.replace(regex, (_fullMatch, attrs, content) => {
        // Robust attribute extraction (handles missing quotes or escaped quotes)
        const getAttr = (name: string) => {
          const match = new RegExp(`${name}=(?:["'\\\\]+([^"'\\\\\\s>]+)["'\\\\]+|([^"\\\\\\s>]+))`, 'i').exec(attrs);
          return match ? (match[1] || match[2]) : null;
        };
        
        const identifier = getAttr('identifier') || `artifact-${Date.now()}`;
        const type = getAttr('type') || 'text/plain';
        const title = getAttr('title') || 'Generated Artifact';
        
        // Unescape content in case the LLM HTML-escaped the internal SVG/Code
        const unescapedContent = content
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');
        
        parsedArtifacts.push({ id: identifier, title, type, content: unescapedContent });
        
        return `\n\n> 📦 **Artifact Created:** \`${title}\`. Click to view in the Artifacts Panel.\n\n`;
      });

      return { artifacts: parsedArtifacts, cleanText };
    }, [displayText]);

    // Notify parent when a new artifact is fully parsed
    useEffect(() => {
      if (artifacts.length > 0 && onArtifactFound) {
        onArtifactFound(artifacts[artifacts.length - 1]);
      }
    }, [artifacts.length, onArtifactFound]);

    // Nothing to show yet
    if (!displayText && !agentStepsText && isGenerating) {
      return (
        <div className="msg-row assistant">
          <div className="msg-avatar"><Bot size={18} /></div>
          <div className="msg-body">
            <div className="thinking-waiting">
              <div className="thinking-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!displayText && !agentStepsText && !isGenerating) return null;

    return (
      <div className="msg-row assistant" style={{ animation: 'fadeInUp 0.2s ease' }}>
        <div className="msg-avatar"><Bot size={18} /></div>
        <div className="msg-body">

          {/* Thinking Block — Claude style */}
          {hasThought && (
            <div className={`thinking-block ${isGenerating && !displayText ? 'thinking-active' : 'thinking-done'}`}>
              <button
                className="thinking-header"
                onClick={() => setThinkingExpanded(!thinkingExpanded)}
                aria-expanded={thinkingExpanded}
              >
                <div className="thinking-header-left">
                  {isGenerating && !isDoneThinking ? (
                    <span className="thinking-shimmer-dot" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                      <path d="M9 12l2 2 4-4" />
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                  )}
                  <span className="thinking-label">
                    {isGenerating && !isDoneThinking
                      ? `Thinking${elapsedSeconds > 0 ? ` · ${elapsedSeconds}s` : '...'}`
                      : `Thought for ${thoughtDuration}s`}
                  </span>
                </div>
                <svg
                  className={`thinking-chevron ${thinkingExpanded ? 'open' : ''}`}
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {thinkingExpanded && (
                <div className="thinking-body" ref={stepsRef}>
                  <div className="thinking-text">{agentStepsText}</div>
                </div>
              )}
            </div>
          )}

          {/* Main response */}
          {cleanText && (
            <div className="msg-content">
              <MarkdownMessage content={cleanText} />
            </div>
          )}

          {/* Citations */}
          {citations.length > 0 && (
            <div className="citations-list">
              <span className="citations-header">Sources</span>
              <div className="citations-container" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
                {citations.map((cit) => {
                  // Show just the filename, not the full path
                  const isUrl = cit.filepath.startsWith('http');
                  const displayName = isUrl
                    ? (() => { try { return new URL(cit.filepath).hostname; } catch { return cit.filepath; } })()
                    : (cit.filepath.split(/[/\\]/).pop() || cit.filepath);
                  return (
                    <span 
                      key={cit.source_index} 
                      className="citation-tag" 
                      title={cit.filepath}
                      onClick={() => onCitationClick && onCitationClick(cit.document_id)}
                      style={{ cursor: onCitationClick ? 'pointer' : 'default' }}
                    >
                      <span className="citation-num">{cit.source_index}</span>
                      {displayName.length > 28 ? displayName.slice(0, 26) + '…' : displayName}
                      <span className="citation-tooltip">
                        <div className="citation-tooltip-file">
                          {isUrl ? '🌐 ' : '📄 '}{displayName}
                        </div>
                        <div className="citation-tooltip-text">{cit.text}</div>
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);
