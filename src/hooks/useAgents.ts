import { useState, useCallback } from "react";
import { Agent, ApiAdapter } from "../api_client";

export function useAgents(
  getApiClient: () => ApiAdapter,
  showToast: (msg: string, type: "success" | "error" | "info") => void
) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [selectedKbAgentId, setSelectedKbAgentId] = useState<string>("global");

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDesc, setNewAgentDesc] = useState("");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");
  const [newAgentSkills, setNewAgentSkills] = useState<string[]>([]);
  const [newAgentDefaultCategory, setNewAgentDefaultCategory] = useState("");

  const loadAgents = useCallback(async () => {
    try {
      const list = await getApiClient().listAgents();
      setAgents(list);
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }, [getApiClient]);

  const handleSaveAgent = async () => {
    if (!newAgentName.trim()) {
      showToast("Agent name is required", "error");
      return;
    }
    try {
      const apiClient = getApiClient();
      if (editingAgentId) {
        await apiClient.updateAgent(
          editingAgentId,
          newAgentName.trim(),
          newAgentDesc.trim(),
          newAgentPrompt.trim(),
          newAgentSkills,
          newAgentDefaultCategory.trim() || undefined
        );
        showToast("Agent updated successfully", "success");
      } else {
        const id = `agent_${Date.now()}`;
        await apiClient.createAgent(
          id,
          newAgentName.trim(),
          newAgentDesc.trim(),
          newAgentPrompt.trim(),
          newAgentSkills,
          newAgentDefaultCategory.trim() || undefined
        );
        showToast("Agent created successfully", "success");
      }
      setShowAddAgent(false);
      setEditingAgentId(null);
      setNewAgentName("");
      setNewAgentDesc("");
      setNewAgentPrompt("");
      setNewAgentSkills([]);
      setNewAgentDefaultCategory("");
      await loadAgents();
    } catch (err: any) {
      showToast(`Failed to save agent: ${err.message || err}`, "error");
    }
  };

  const handleDeleteAgent = async (id: string) => {
    try {
      await getApiClient().deleteAgent(id);
      showToast("Agent deleted", "success");
      if (activeAgentId === id) setActiveAgentId(null);
      if (selectedKbAgentId === id) setSelectedKbAgentId("global");
      await loadAgents();
    } catch (err: any) {
      showToast(`Failed to delete agent: ${err.message || err}`, "error");
    }
  };

  const openAddAgentModal = () => {
    setEditingAgentId(null);
    setNewAgentName("");
    setNewAgentDesc("");
    setNewAgentPrompt("");
    setNewAgentSkills([]);
    setNewAgentDefaultCategory("");
    setShowAddAgent(true);
  };

  const openEditAgentModal = (agent: Agent) => {
    setEditingAgentId(agent.id);
    setNewAgentName(agent.name);
    setNewAgentDesc(agent.description);
    setNewAgentPrompt(agent.system_prompt);
    try {
      setNewAgentSkills(JSON.parse(agent.skills || "[]"));
    } catch {
      setNewAgentSkills([]);
    }
    setNewAgentDefaultCategory(agent.default_category || "");
    setShowAddAgent(true);
  };

  return {
    agents,
    activeAgentId,
    setActiveAgentId,
    selectedKbAgentId,
    setSelectedKbAgentId,
    showAddAgent,
    setShowAddAgent,
    editingAgentId,
    newAgentName,
    setNewAgentName,
    newAgentDesc,
    setNewAgentDesc,
    newAgentPrompt,
    setNewAgentPrompt,
    newAgentSkills,
    setNewAgentSkills,
    newAgentDefaultCategory,
    setNewAgentDefaultCategory,
    loadAgents,
    handleSaveAgent,
    handleDeleteAgent,
    openAddAgentModal,
    openEditAgentModal,
  };
}
