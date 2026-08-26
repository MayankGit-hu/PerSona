import React from "react";
import { Collection } from "../api_client";

interface CollectionsViewProps {
  collections: Collection[];
  showAddCollection: boolean;
  editingCollectionId: string | null;
  newCollectionName: string;
  newCollectionDesc: string;
  onToggleAddCollection: () => void;
  onSaveCollection: (e?: React.FormEvent) => void;
  onDeleteCollection: (id: string) => void;
  onClearCollection: (id: string) => void;
  onEditCollection: (col: Collection) => void;
  onIngestFileForCollection?: (collectionId: string) => void;
  setNewCollectionName: (v: string) => void;
  setNewCollectionDesc: (v: string) => void;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  collections,
  showAddCollection,
  editingCollectionId,
  newCollectionName,
  newCollectionDesc,
  onToggleAddCollection,
  onSaveCollection,
  onDeleteCollection,
  onClearCollection,
  onEditCollection,
  onIngestFileForCollection,
  setNewCollectionName,
  setNewCollectionDesc,
}) => {
  return (
    <div className="page-container">
      <header className="page-header">
        <h2 className="page-title">Collections</h2>
        <p className="page-subtitle">Manage isolated knowledge collections and databases for your agents.</p>
      </header>

      <div className="page-section" style={{ background: "transparent", border: "none", padding: "0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
          {collections.map(collection => (
            <div key={collection.id} className="glass-card" style={{ padding: "16px", borderRadius: "12px", border: "1px solid var(--border-light)", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{collection.name}</h3>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "rgba(255, 255, 255, 0.05)", padding: "2px 8px", borderRadius: "12px" }}>
                  ID: {collection.id.substring(0,8)}...
                </div>
              </div>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)", flex: 1, minHeight: "40px" }}>
                {collection.description}
              </p>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
                {onIngestFileForCollection && (
                  <button
                    className="btn-primary"
                    onClick={(e) => { e.stopPropagation(); onIngestFileForCollection(collection.id); }}
                    style={{ flex: "1 1 100%", padding: "6px", fontSize: "0.85rem" }}
                  >
                    + Add Files to Collection
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={(e) => { e.stopPropagation(); onClearCollection(collection.id); }}
                  style={{ flex: 1, padding: "6px", fontSize: "0.85rem" }}
                >
                  Clear Docs
                </button>
                <button
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditCollection(collection);
                  }}
                  style={{ padding: "6px 12px", fontSize: "0.85rem" }}
                >
                  Edit
                </button>
                <button
                  className="btn-secondary"
                  onClick={(e) => { e.stopPropagation(); onDeleteCollection(collection.id); }}
                  style={{ padding: "6px 12px", fontSize: "0.85rem", color: "#ef4444", borderColor: "rgba(239, 68, 68, 0.3)" }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="page-section" style={{ background: "transparent", border: "none", padding: "0" }}>
        <button
          className={`btn-dashed-cta ${showAddCollection ? 'cancel' : ''}`}
          onClick={onToggleAddCollection}
        >
          {showAddCollection ? '✕ Cancel' : '+ Create Collection'}
        </button>

        {showAddCollection && (
          <div className="page-section" style={{ marginTop: "16px" }}>
            <div className="page-section-title">{editingCollectionId ? "Edit Collection" : "New Collection"}</div>
            <form onSubmit={onSaveCollection} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="form-group">
                <label className="form-label">Collection Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Science Papers"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Vector database for biology and physics papers"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: "8px", width: "fit-content" }}>
                {editingCollectionId ? "Save Changes" : "Create Collection"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
