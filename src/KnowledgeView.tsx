import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ApiAdapter, Document as AppDocument } from './api_client';
import ForceGraph2D from 'react-force-graph-2d';

interface KnowledgeViewProps {
  getApiClient: () => ApiAdapter;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  collections?: any[];
  selectedCollectionId?: string;
  onSelectCollection?: (id: string) => void;
  onIngestFile?: () => void;
  onIngestFolder?: () => void;
  onIngestUrl?: (url: string) => void;
  isIngesting?: boolean;
  ingestProgress?: string | null;
  onCollectionsChanged?: () => void;
}

// ---- Helpers ----

const getFileIcon = (filepath: string): string => {
  const ext = filepath.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return '📄';
  if (['md', 'markdown', 'txt', 'rst'].includes(ext)) return '📝';
  if (['docx', 'doc'].includes(ext)) return '📃';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️';
  if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return '🎵';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎥';
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c'].includes(ext)) return '💻';
  if (['json', 'yaml', 'yml', 'toml', 'env'].includes(ext)) return '⚙️';
  if (filepath.startsWith('http://') || filepath.startsWith('https://')) return '🌐';
  return '📁';
};

const getStatusColor = (status?: string): string => {
  if (!status) return '#6b7280';
  const s = status.toLowerCase();
  if (s === 'indexed' || s === 'completed') return '#10b981';
  if (s.startsWith('failed')) return '#ef4444';
  if (s === 'pending' || s === 'processing') return '#f59e0b';
  return '#6b7280';
};

const formatDate = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch {
    return '';
  }
};

const getCategoryColor = (seed?: string): string => {
  if (!seed) return '#8b5cf6';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 60%)`;
};

// =========================================================
//  Library View
// =========================================================
const LibraryView = ({ documents, onDelete, onRefresh, isLoading, collections, selectedCollectionId, onSelectCollection, onUpdateCategory, onUpdateCollection, onCollectionsChanged, getApiClient, showToast }: {
  documents: AppDocument[];
  onDelete: (id: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  collections?: any[];
  selectedCollectionId?: string;
  onSelectCollection?: (id: string) => void;
  onUpdateCategory?: (id: string, category: string) => void;
  onUpdateCollection?: (id: string, collectionId: string | null) => void;
  onCollectionsChanged?: () => void;
  getApiClient: () => ApiAdapter;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingCatId, setAddingCatId] = useState<string | null>(null);
  const [addingColId, setAddingColId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newColName, setNewColName] = useState('');

  const filtered = documents.filter(d => 
    d.filepath.toLowerCase().includes(search.toLowerCase()) || 
    (d.category && d.category.toLowerCase().includes(search.toLowerCase()))
  );
  
  const uniqueCategories = Array.from(new Set(documents.map(d => d.category).filter(Boolean))) as string[];
  const predefinedCategories = ["Research", "Work", "Personal", "Code", "Finance", "Legal"];
  const allCategories = Array.from(new Set([...predefinedCategories, ...uniqueCategories]));

  const matchesCat = (doc: AppDocument) => categoryFilter === 'all' || doc.category === categoryFilter;
  const finalFiltered = filtered.filter(matchesCat);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await onDelete(id);
    setDeletingId(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div className="knowledge-toolbar">
        <div style={{ position: 'relative', flex: 1 }}>
          <svg style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            className="form-input"
            placeholder="Search documents..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '38px' }}
          />
        </div>
        {allCategories.length > 0 && (
          <select
            className="form-input"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ width: 'auto', minWidth: '140px', flexShrink: 0 }}
          >
            <option value="all">All Categories</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
        {collections && collections.length > 0 && onSelectCollection && (
          <select
            className="form-input"
            value={selectedCollectionId}
            onChange={e => onSelectCollection(e.target.value)}
            style={{ width: 'auto', minWidth: '160px', flexShrink: 0 }}
          >
            <option value="default_collection">Default Collection</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <button
          className="btn-secondary"
          onClick={onRefresh}
          disabled={isLoading}
          style={{ flexShrink: 0, padding: '8px 12px' }}
          title="Refresh"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
        <span><strong style={{ color: 'var(--text-main)' }}>{documents.length}</strong> total</span>
        <span><strong style={{ color: '#10b981' }}>{documents.filter(d => d.status.toLowerCase() === 'indexed').length}</strong> indexed</span>
        {documents.filter(d => d.status.toLowerCase().startsWith('failed')).length > 0 && (
          <span><strong style={{ color: '#ef4444' }}>{documents.filter(d => d.status.toLowerCase().startsWith('failed')).length}</strong> failed</span>
        )}
        {search && <span style={{ marginLeft: 'auto' }}>{finalFiltered.length} results</span>}
      </div>

      {/* Grid */}
      <div className="knowledge-grid">
        {isLoading && documents.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 16px', width: '28px', height: '28px' }} />
            Loading knowledge base...
          </div>
        ) : finalFiltered.length === 0 ? (
          <div style={{ gridColumn: '1/-1', padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            {documents.length === 0 ? (
              <>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📭</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)', marginBottom: '6px' }}>No documents yet</div>
                <div style={{ fontSize: '0.85rem' }}>Head to the Ingest tab to add files or web pages to your knowledge base.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔍</div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>No matches for "{search}"</div>
              </>
            )}
          </div>
        ) : (
          finalFiltered.map(doc => {
            const filename = doc.filepath.split(/[/\\]/).pop() || doc.filepath;
            const isWeb = doc.filepath.startsWith('http');
            return (
              <div key={doc.id} className="doc-card">
                <div className="doc-card-top">
                  <span className="doc-card-icon">{getFileIcon(doc.filepath)}</span>
                  <button
                    className="doc-card-delete"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    title="Remove document"
                  >
                    {deletingId === doc.id ? (
                      <div className="spinner" style={{ width: '12px', height: '12px' }} />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                      </svg>
                    )}
                  </button>
                </div>

                <div className="doc-card-name" title={isWeb ? doc.filepath : filename}>
                  {isWeb ? new URL(doc.filepath).hostname : filename}
                </div>

                {isWeb && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dark)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.filepath}
                  </div>
                )}

                <div className="doc-card-meta" style={{ marginBottom: '8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getStatusColor(doc.status), display: 'inline-block', flexShrink: 0 }} />
                    {doc.status.split(':')[0]}
                  </span>
                  {doc.ingested_at && (
                    <span>{formatDate(doc.ingested_at)}</span>
                  )}
                </div>

                {addingCatId === doc.id ? (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', flex: 1 }}
                      placeholder="New category..."
                      value={newCatName}
                      autoFocus
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (newCatName.trim() && onUpdateCategory) {
                            onUpdateCategory(doc.id, newCatName.trim());
                          }
                          setAddingCatId(null);
                        } else if (e.key === 'Escape') {
                          setAddingCatId(null);
                        }
                      }}
                      onBlur={() => {
                        if (newCatName.trim() && onUpdateCategory) {
                          onUpdateCategory(doc.id, newCatName.trim());
                        }
                        setAddingCatId(null);
                      }}
                    />
                  </div>
                ) : (
                  <select
                    className="form-input"
                    style={{ 
                      fontSize: '0.75rem', 
                      padding: '2px 4px', 
                      width: '100%', 
                      height: '24px',
                      background: doc.category ? `${getCategoryColor(doc.category)}18` : 'var(--bg-panel)',
                      color: doc.category ? getCategoryColor(doc.category) : 'var(--text-muted)',
                      borderColor: doc.category ? `${getCategoryColor(doc.category)}40` : 'var(--border-light)',
                      borderRadius: '4px',
                      marginBottom: '4px'
                    }}
                    value={doc.category || ''}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setNewCatName('');
                        setAddingCatId(doc.id);
                      } else if (onUpdateCategory) {
                        onUpdateCategory(doc.id, e.target.value);
                      }
                    }}
                  >
                    <option value="">Uncategorized</option>
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__new__">+ New Category...</option>
                  </select>
                )}

                {addingColId === doc.id ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ fontSize: '0.75rem', padding: '2px 4px', height: '24px', flex: 1 }}
                      placeholder="Collection name..."
                      value={newColName}
                      autoFocus
                      onChange={e => setNewColName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (newColName.trim() && onUpdateCollection) {
                            const newId = 'col_' + Date.now();
                            getApiClient().createCollection(newId, newColName.trim(), "").then(() => {
                              if (onCollectionsChanged) {
                                onCollectionsChanged();
                              }
                              onUpdateCollection(doc.id, newId);
                            }).catch((err: any) => {
                              showToast(`Failed to create collection: ${err}`, 'error');
                            });
                          }
                          setAddingColId(null);
                        } else if (e.key === 'Escape') {
                          setAddingColId(null);
                        }
                      }}
                      onBlur={() => setAddingColId(null)}
                    />
                  </div>
                ) : collections && collections.length > 0 && (
                  <select
                    className="form-input"
                    style={{ 
                      fontSize: '0.75rem', 
                      padding: '2px 4px', 
                      width: '100%', 
                      height: '24px',
                      background: 'var(--bg-panel)',
                      color: 'var(--text-muted)',
                      borderColor: 'var(--border-light)',
                      borderRadius: '4px'
                    }}
                    value={doc.collection_id || ''}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setNewColName('');
                        setAddingColId(doc.id);
                      } else if (onUpdateCollection) {
                        onUpdateCollection(doc.id, e.target.value === '' ? null : e.target.value);
                      }
                    }}
                  >
                    <option value="">No Collection</option>
                    {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="__new__">+ New Collection...</option>
                  </select>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// =========================================================
//  Graph View (2D)
// =========================================================
interface GraphNode {
  id: string;
  name: string;
  filepath: string;
  category?: string;
  status: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
}

const GraphView: React.FC<{
  documents: AppDocument[];
}> = ({ documents }) => {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (graphRef.current) {
      // Adjust the D3 force engine for a better layout
      graphRef.current.d3Force('charge').strength(-300); // Push nodes further apart
      graphRef.current.d3Force('link').distance(60);     // Give links more space
      
      setTimeout(() => {
        graphRef.current.zoomToFit(400, 50);
      }, 300);
    }
  }, [documents]);

  const categoryGroups: Record<string, string[]> = {};
  
  // Group documents by category
  documents.forEach(doc => {
    const key = doc.category || 'Uncategorized';
    if (!categoryGroups[key]) categoryGroups[key] = [];
    categoryGroups[key].push(doc.id);
  });

  const nodes: GraphNode[] = [];
  const links: { source: string; target: string }[] = [];

  // Create nodes and hub links
  Object.entries(categoryGroups).forEach(([category, docIds]) => {
    const hubId = `hub_${category}`;
    
    // Add category hub node
    nodes.push({
      id: hubId,
      name: category,
      filepath: '',
      category: category,
      status: 'completed',
      color: getCategoryColor(category),
      val: 6, // Hubs are larger
    });

    // Add document nodes and link them to the hub
    docIds.forEach(docId => {
      const doc = documents.find(d => d.id === docId)!;
      nodes.push({
        id: doc.id,
        name: doc.filepath.split(/[/\\]/).pop() || doc.filepath,
        filepath: doc.filepath,
        category: doc.category,
        status: doc.status,
        color: getCategoryColor(doc.category || doc.id),
        val: 2, // Documents are smaller
      });

      links.push({ source: hubId, target: doc.id });
    });
  });

  const graphData = { nodes, links };

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ flex: 1, height: '100%', background: '#09090b' }}>
        <ForceGraph2D
          ref={graphRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={(node: any) => node.category ? `[${node.category}] ${node.name}` : node.name}
          nodeColor={(node: any) => selectedNode?.id === node.id ? '#ffffff' : node.color}
          nodeRelSize={5}
          linkColor={() => 'rgba(255,255,255,0.1)'}
          linkWidth={1}
          backgroundColor="#09090b"
          onNodeClick={(node: any) => {
            setSelectedNode(node as GraphNode);
            if (graphRef.current && node.x !== undefined && node.y !== undefined) {
              // Offset the camera slightly to the left (x + 100) so the right-side panel doesn't obscure the node
              graphRef.current.centerAt(node.x + 100, node.y, 800);
            }
          }}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.name as string;
            const fontSize = Math.max(10 / globalScale, 2);
            ctx.font = `${fontSize}px Inter, sans-serif`;

            const isSelected = selectedNode?.id === node.id;
            ctx.fillStyle = isSelected ? '#ffffff' : node.color;
            ctx.beginPath();
            ctx.arc(node.x!, node.y!, isSelected ? 7 : 5, 0, 2 * Math.PI, false);
            ctx.fill();

            if (globalScale > 1.5) {
              ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255,255,255,0.75)';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(label.length > 20 ? label.slice(0, 18) + '…' : label, node.x!, node.y! + 10);
            }
          }}
          cooldownTicks={80}
        />
      </div>

      {selectedNode && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '300px',
          height: '100%',
          background: 'rgba(9, 9, 11, 0.95)',
          backdropFilter: 'blur(12px)',
          borderLeft: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          boxShadow: '-8px 0 24px rgba(0,0,0,0.5)'
        }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', wordBreak: 'break-word' }}>{selectedNode.name}</div>
              {selectedNode.category && (
                <div style={{ marginTop: '6px', display: 'inline-flex', padding: '2px 8px', borderRadius: '99px', fontSize: '0.7rem', background: `${getCategoryColor(selectedNode.category)}20`, color: getCategoryColor(selectedNode.category), border: `1px solid ${getCategoryColor(selectedNode.category)}40` }}>
                  {selectedNode.category}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ padding: '16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.85rem' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Path</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-main)', wordBreak: 'break-all', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px' }}>
                {selectedNode.filepath}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: getStatusColor(selectedNode.status), display: 'inline-block' }} />
                <span>{(selectedNode.status || 'completed').split(':')[0]}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================
//  Root Export
export default function KnowledgeView({ getApiClient, showToast, collections, selectedCollectionId, onSelectCollection, onIngestFile, onIngestFolder, onIngestUrl, isIngesting, ingestProgress, onCollectionsChanged }: KnowledgeViewProps) {
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'library' | 'graph'>('library');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const apiClient = getApiClient();
      // Only list documents in the selected collection
      const docs = await apiClient.listAllDocuments();
      const filteredDocs = selectedCollectionId && selectedCollectionId !== "default_collection" 
        ? docs.filter(d => d.collection_id === selectedCollectionId)
        : docs;
      
      setDocuments(filteredDocs);
    } catch (err) {
      showToast(`Failed to load knowledge: ${err}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [getApiClient, showToast, selectedCollectionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    try {
      await getApiClient().deleteDocument(id);
      showToast('Document deleted successfully', 'success');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to delete document: ${err.message || err}`, 'error');
    }
  };

  const handleUpdateCategory = async (id: string, category: string) => {
    try {
      await getApiClient().updateDocumentCategory(id, category);
      showToast('Category updated', 'success');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to update category: ${err.message || err}`, 'error');
    }
  };

  const handleUpdateCollection = async (id: string, collectionId: string | null) => {
    try {
      await getApiClient().updateDocumentCollection(id, collectionId);
      showToast('Collection updated', 'success');
      loadData();
    } catch (err: any) {
      console.error(err);
      showToast(`Failed to update collection: ${err.message || err}`, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg-obsidian)' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Knowledge Base</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <select
              value={selectedCollectionId || 'default_collection'}
              onChange={(e) => onSelectCollection?.(e.target.value)}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '2px 8px', color: 'var(--text-main)', fontSize: '0.8rem' }}
            >
              <option value="default_collection">All Collections</option>
              {collections?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {isLoading ? 'Loading...' : `${documents.length} document${documents.length !== 1 ? 's' : ''} indexed`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {showUrlInput && (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (urlInput.trim() && onIngestUrl) {
                onIngestUrl(urlInput);
                setUrlInput('');
                setShowUrlInput(false);
              }
            }} style={{ display: 'flex', gap: '4px' }}>
              <input 
                type="url" 
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://example.com"
                className="form-input"
                style={{ width: '200px', padding: '6px 12px', fontSize: '0.8rem' }}
                autoFocus
              />
              <button type="submit" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Add</button>
              <button type="button" className="btn-secondary" onClick={() => setShowUrlInput(false)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Cancel</button>
            </form>
          )}
          {!showUrlInput && onIngestUrl && (
            <button
              onClick={() => setShowUrlInput(true)}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              Add URL
            </button>
          )}
          {onIngestFile && (
            <button
              onClick={onIngestFile}
              disabled={isIngesting}
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: isIngesting ? 0.7 : 1, cursor: isIngesting ? 'not-allowed' : 'pointer' }}
              title="Upload Files"
            >
              {isIngesting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10"></circle></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              )}
              {isIngesting ? 'Ingesting...' : 'Files'}
            </button>
          )}
          {onIngestFolder && (
            <button
              onClick={onIngestFolder}
              disabled={isIngesting}
              className="btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--accent-blue)', opacity: isIngesting ? 0.7 : 1, cursor: isIngesting ? 'not-allowed' : 'pointer' }}
              title="Upload Folder"
            >
              {isIngesting ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10"></circle></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
              )}
              {isIngesting ? 'Ingesting...' : 'Folder'}
            </button>
          )}
        </div>
        {ingestProgress && (
          <div style={{ marginLeft: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeDasharray="30" strokeDashoffset="10"></circle></svg>
            <span style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ingestProgress}</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', background: 'var(--bg-card)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border-light)' }}>
          <button
            onClick={() => setViewMode('library')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              background: viewMode === 'library' ? 'var(--accent-violet)' : 'transparent',
              color: viewMode === 'library' ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
            </svg>
            Library
          </button>
          <button
            onClick={() => setViewMode('graph')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 500,
              background: viewMode === 'graph' ? 'var(--accent-violet)' : 'transparent',
              color: viewMode === 'graph' ? 'white' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
            Graph
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'library' ? (
          <LibraryView
            documents={documents}
            onDelete={handleDelete}
            onRefresh={loadData}
            isLoading={isLoading}
            collections={collections}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={onSelectCollection}
            onUpdateCategory={handleUpdateCategory}
            onUpdateCollection={handleUpdateCollection}
            onCollectionsChanged={onCollectionsChanged}
            getApiClient={getApiClient}
            showToast={showToast}
          />
        ) : (
          <GraphView documents={documents} />
        )}
      </div>
    </div>
  );
};


