import { useState, useCallback } from "react";
import type { FormEvent } from "react";
import { Collection, ApiAdapter } from "../api_client";

export function useCollections(
  getApiClient: () => ApiAdapter,
  showToast: (msg: string, type: "success" | "error" | "info") => void
) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("default_collection");
  const [showAddCollection, setShowAddCollection] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");

  const loadCollections = useCallback(async () => {
    try {
      const list = await getApiClient().listCollections();
      setCollections(list);
    } catch (err) {
      console.error("Failed to load collections:", err);
    }
  }, [getApiClient]);

  const handleSaveCollection = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!newCollectionName.trim()) {
      showToast("Collection name is required", "error");
      return;
    }
    try {
      const apiClient = getApiClient();
      if (editingCollectionId) {
        await apiClient.updateCollection(editingCollectionId, newCollectionName.trim(), newCollectionDesc.trim());
        showToast("Collection updated", "success");
      } else {
        const newId = `col_${Date.now()}`;
        await apiClient.createCollection(newId, newCollectionName.trim(), newCollectionDesc.trim());
        showToast("Collection created", "success");
      }
      setShowAddCollection(false);
      setEditingCollectionId(null);
      setNewCollectionName("");
      setNewCollectionDesc("");
      await loadCollections();
    } catch (err: any) {
      showToast(`Failed to save collection: ${err.message || err}`, "error");
    }
  };

  const handleDeleteCollection = async (id: string) => {
    if (id === "default_collection") {
      showToast("Cannot delete default collection", "error");
      return;
    }
    try {
      await getApiClient().deleteCollection(id);
      showToast("Collection deleted", "success");
      if (selectedCollectionId === id) {
        setSelectedCollectionId("default_collection");
      }
      await loadCollections();
    } catch (err: any) {
      showToast(`Failed to delete collection: ${err.message || err}`, "error");
    }
  };

  const openAddModal = () => {
    setEditingCollectionId(null);
    setNewCollectionName("");
    setNewCollectionDesc("");
    setShowAddCollection(true);
  };

  const openEditModal = (col: Collection) => {
    setEditingCollectionId(col.id);
    setNewCollectionName(col.name);
    setNewCollectionDesc(col.description);
    setShowAddCollection(true);
  };

  return {
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    showAddCollection,
    setShowAddCollection,
    editingCollectionId,
    newCollectionName,
    setNewCollectionName,
    newCollectionDesc,
    setNewCollectionDesc,
    loadCollections,
    handleSaveCollection,
    handleDeleteCollection,
    openAddModal,
    openEditModal,
  };
}
