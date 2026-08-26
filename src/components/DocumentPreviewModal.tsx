import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface DocumentPreviewModalProps {
  documentId: string;
  onClose: () => void;
  getApiClient?: () => any;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ documentId, onClose }) => {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true);
        const text: string = await invoke('get_document_text', { documentId });
        setContent(text);
      } catch (err: any) {
        setError(err.toString());
      } finally {
        setLoading(false);
      }
    };
    fetchContent();

    // Close on Escape
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [documentId]);

  return (
    <div className="doc-preview-overlay" onClick={onClose}>
      <div className="doc-preview-box" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="doc-preview-header">
          <h2 className="doc-preview-title">Document Preview</h2>
          <button className="doc-preview-close" onClick={onClose} aria-label="Close preview">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="doc-preview-content">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div className="spinner" />
            </div>
          ) : error ? (
            <div style={{ color: 'var(--red)', textAlign: 'center', marginTop: '2rem', fontSize: '0.88rem' }}>
              ⚠ Error loading document: {error}
            </div>
          ) : (
            content || <i style={{ color: 'var(--text-3)' }}>Document has no text content.</i>
          )}
        </div>
      </div>
    </div>
  );
};
