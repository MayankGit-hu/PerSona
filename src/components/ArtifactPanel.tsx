import React, { useMemo, useState } from 'react';
import { Artifact } from '../api_client';
import { X, Code, Eye, Copy, Download, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifact, onClose }) => {
  const isWebType = artifact.type === 'text/html' || artifact.type === 'image/svg+xml';
  const [width, setWidth] = React.useState(500);
  const [isDragging, setIsDragging] = React.useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleDownload = () => {
    const extension = artifact.type === 'image/svg+xml' ? 'svg' : artifact.type === 'text/html' ? 'html' : 'txt';
    const blob = new Blob([artifact.content], { type: artifact.type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const srcDoc = useMemo(() => {
    if (!isWebType) return '';
    
    // Script to enable pan and zoom for any SVGs found in the artifact
    const panZoomScript = `
      <script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js"></script>
      <script>
        window.onload = function() {
          var svgs = document.querySelectorAll('svg');
          svgs.forEach(function(svg) {
            svg.style.width = '100%';
            svg.style.height = '100vh';
            svgPanZoom(svg, {
              zoomEnabled: true,
              controlIconsEnabled: true,
              fit: true,
              center: true,
              minZoom: 0.1
            });
          });
        };
      </script>
    `;

    const svgResponsiveStyle = '<style>body { margin: 0; padding: 16px; color: #fff; font-family: sans-serif; overflow: auto; }</style>';
    
    if (artifact.type === 'image/svg+xml') {
      return `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { margin: 0; background: transparent; color: white; overflow: hidden; }
          </style>
        </head>
        <body>
          ${artifact.content}
          ${panZoomScript}
        </body>
        </html>
      `;
    }
    
    // For text/html, inject the responsive style and the pan/zoom script just in case it contains an SVG
    return svgResponsiveStyle + artifact.content + panZoomScript;
  }, [artifact.content, artifact.type, isWebType]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    
    setIsDragging(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      // Panel is on the right, so moving mouse left (negative delta) INCREASES width
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(300, Math.min(startWidth + deltaX, window.innerWidth * 0.8));
      setWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div className="artifact-panel" style={{
      width: `${width}px`,
      flexShrink: 0,
      position: 'relative',
      borderLeft: '1px solid var(--border-light)',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--bg-sidebar)',
      overflow: 'hidden',
      userSelect: isDragging ? 'none' : 'auto' // Prevent text selection while dragging
    }}>
      {/* Resizer Handle */}
      <div 
        onMouseDown={startDrag}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          zIndex: 10,
          backgroundColor: 'transparent'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-violet)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      />

      <div className="artifact-header" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-light)',
        backgroundColor: 'rgba(255,255,255,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#e5e5e5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code size={16} color="var(--accent-violet)" />
            {artifact.title || 'Artifact'}
          </h3>
          
          {isWebType && (
            <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <button 
                onClick={() => setViewMode('preview')}
                style={{ 
                  background: viewMode === 'preview' ? 'var(--bg-card)' : 'transparent', 
                  border: 'none', color: viewMode === 'preview' ? '#fff' : 'var(--text-muted)', 
                  cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                }}
              >
                <Eye size={14} /> Preview
              </button>
              <button 
                onClick={() => setViewMode('code')}
                style={{ 
                  background: viewMode === 'code' ? 'var(--bg-card)' : 'transparent', 
                  border: 'none', color: viewMode === 'code' ? '#fff' : 'var(--text-muted)', 
                  cursor: 'pointer', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: '4px', transition: 'all 0.2s'
                }}
              >
                <Code size={14} /> Code
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button 
            onClick={handleCopy}
            title="Copy source code"
            style={{ background: 'transparent', border: 'none', color: copied ? '#10b981' : 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          <button 
            onClick={handleDownload}
            title="Download file"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <Download size={16} />
          </button>
          <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--border-light)', margin: '0 4px' }} />
          <button 
            onClick={onClose}
            title="Close panel"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '4px', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,50,50,0.1)'; e.currentTarget.style.color = '#ff6b6b'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="artifact-content" style={{ flex: 1, overflow: 'auto', backgroundColor: '#09090b' }}>
        {isWebType && viewMode === 'preview' ? (
          <iframe 
            srcDoc={srcDoc} 
            title={artifact.title}
            style={{ 
              width: '100%', 
              height: '100%', 
              border: 'none', 
              background: 'white',
              pointerEvents: isDragging ? 'none' : 'auto'
            }}
            sandbox="allow-scripts"
          />
        ) : viewMode === 'code' || !isWebType ? (
          <SyntaxHighlighter
            language={artifact.type === 'text/html' ? 'html' : artifact.type === 'image/svg+xml' ? 'html' : 'text'}
            style={vscDarkPlus as any}
            customStyle={{ margin: 0, height: '100%', borderRadius: 0, backgroundColor: '#09090b', padding: '16px' }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        ) : null}
      </div>
    </div>
  );
};
