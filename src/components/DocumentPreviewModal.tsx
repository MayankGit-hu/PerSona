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
  }, [documentId]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        width: '80%',
        maxWidth: '900px',
        height: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 500, color: '#e5e7eb' }}>
            Document Preview
          </h2>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              padding: '4px'
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          color: '#d1d5db',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <div className="spinner" style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: '#f59e0b', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : error ? (
            <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '2rem' }}>
              Error loading document: {error}
            </div>
          ) : (
            <div style={{ 
              whiteSpace: 'pre-wrap', 
              lineHeight: 1.6,
              fontSize: '0.95rem',
              backgroundColor: 'rgba(0,0,0,0.2)',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {content || <i>Document has no text content.</i>}
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
