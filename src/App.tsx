import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TauriApiAdapter, RemoteApiAdapter, ApiAdapter, Document } from "./api_client";
import { Wizard } from "./Wizard";
import KnowledgeView from "./KnowledgeView";
import { CommandPalette } from "./components/CommandPalette";
import { DocumentPreviewModal } from "./components/DocumentPreviewModal";

import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { AgentsView } from "./components/AgentsView";
import { SkillsView } from "./components/SkillsView";
import { SettingsView } from "./components/SettingsView";
import { CollectionsView } from "./components/CollectionsView";

import { useCollections } from "./hooks/useCollections";
import { useAgents } from "./hooks/useAgents";
import { useSkills } from "./hooks/useSkills";
import { useChatThreads } from "./hooks/useChatThreads";

import "./App.css";

export function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const isBrainWindow = queryParams.get("window") === "brain";

  // Connection mode & API Client adapter instantiation
  const [connectionMode, setConnectionMode] = useState<"local" | "remote">("local");
  const [remoteIp, setRemoteIp] = useState("");
  const [remotePort, setRemotePort] = useState(11430);
  const [remotePasscode, setRemotePasscode] = useState("");

  const getApiClient = useCallback((): ApiAdapter => {
    if (connectionMode === "remote" && remoteIp) {
      return new RemoteApiAdapter(remoteIp, remotePort, remotePasscode);
    }
    return new TauriApiAdapter();
  }, [connectionMode, remoteIp, remotePort, remotePasscode]);

  // Toast notifications state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Custom Hooks for Modular Domain State
  const collectionsState = useCollections(getApiClient, showToast);
  const agentsState = useAgents(getApiClient, showToast);
  const skillsState = useSkills(getApiClient, showToast);

  // Runtime settings & model selection
  const [selectedModel, setSelectedModel] = useState("llama3.2:latest");
  const [availableModels, setAvailableModels] = useState<string[]>(["llama3.2:latest", "llama3.1:latest"]);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("auto");

  const chatThreadsState = useChatThreads(
    getApiClient,
    showToast,
    agentsState.activeAgentId,
    selectedCategoryFilter,
    selectedModel
  );

  // Documents state & ingestion
  const [documents, setDocuments] = useState<Document[]>([]);
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestProgress, setIngestProgress] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null);
  const [syncDirectory, setSyncDirectory] = useState<string | null>(null);

  // Ollama health status & host info
  const [ollamaStatus, setOllamaStatus] = useState<"checking" | "ok" | "error">("checking");
  const [hostInfo, setHostInfo] = useState<{ ip: string; port: number; passcode: string; is_running: boolean }>({
    ip: "127.0.0.1",
    port: 11430,
    passcode: "",
    is_running: false,
  });

  const [runtimeSettings, setRuntimeSettings] = useState({
    ollama_base_url: "http://localhost:11434",
    ollama_num_gpu: -1,
    ollama_num_ctx: 4096,
    embedding_model: "nomic-embed-text:latest",
    llm_parsing_enabled: false,
    llm_parsing_model: "llama3.2:latest",
    serper_api_key: "",
    openai_api_key: "",
    anthropic_api_key: "",
  });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"knowledge" | "brain" | "skills" | "settings" | "agents" | "collections" | null>("knowledge");
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  // Window drag handler
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest("input") && !target.closest("a")) {
        getCurrentWindow().startDragging();
      }
    }
  };

  // Keyboard shortcut for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdPaletteOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Window shown auto-focus
  useEffect(() => {
    const unlisten = listen("window-shown", () => {
      setTimeout(() => {
        const input = document.querySelector(".chat-input-field") as HTMLTextAreaElement;
        if (input) input.focus();
      }, 50);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Sidebar resizing handler
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 600) newWidth = 600;
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Load models from Ollama/Cloud
  const loadModels = useCallback(async () => {
    try {
      setOllamaStatus("checking");
      const list = await getApiClient().listModels();
      if (list && list.length > 0) {
        setAvailableModels(list);
        setOllamaStatus("ok");
        if (!list.includes(selectedModel)) {
          setSelectedModel(list[0]);
        }
      } else {
        setOllamaStatus("error");
      }
    } catch (err) {
      console.error("Failed to fetch available models:", err);
      setOllamaStatus("error");
    }
  }, [getApiClient, selectedModel]);

  // Load documents
  const loadDocuments = useCallback(async () => {
    try {
      const docs = await getApiClient().listDocuments();
      setDocuments(docs);
      const all = await getApiClient().listAllDocuments();
      setAllDocs(all);
    } catch (err) {
      console.error("Failed to load documents:", err);
    }
  }, [getApiClient]);

  // Initial load
  useEffect(() => {
    const isSetup = localStorage.getItem("persona_setup_complete");
    if (!isSetup) {
      setShowWizard(true);
    }

    const savedMode = localStorage.getItem("persona_conn_mode") as "local" | "remote";
    if (savedMode) setConnectionMode(savedMode);

    loadModels();
    loadDocuments();
    collectionsState.loadCollections();
    agentsState.loadAgents();
    skillsState.loadSkills();
    chatThreadsState.loadThreads();

    // Fetch sync directory
    invoke<string | null>("get_sync_directory")
      .then((dir) => setSyncDirectory(dir))
      .catch(() => {});

    // Fetch host info
    invoke<any>("get_host_info")
      .then((info) => setHostInfo(info))
      .catch(() => {});
  }, [
    loadModels,
    loadDocuments,
    collectionsState.loadCollections,
    agentsState.loadAgents,
    skillsState.loadSkills,
    chatThreadsState.loadThreads,
  ]);

  // Sync category filter when thread changes
  useEffect(() => {
    if (chatThreadsState.activeThreadId) {
      const t = chatThreadsState.threads.find((x) => x.id === chatThreadsState.activeThreadId);
      if (t && t.category_filter) {
        setSelectedCategoryFilter(t.category_filter);
      } else {
        setSelectedCategoryFilter("auto");
      }
      chatThreadsState.loadMessages(chatThreadsState.activeThreadId);
    }
  }, [chatThreadsState.activeThreadId, chatThreadsState.threads, chatThreadsState.loadMessages]);

  // Ingestion Handlers
  const handleIngestFile = async (targetCollectionId?: string) => {
    if (connectionMode === "remote") {
      showToast("Local file ingestion is not available in Thin Client Mode. Please use Web Scraper.", "info");
      return;
    }
    try {
      const selectedPaths = await invoke<string[] | null>("select_files");
      if (!selectedPaths || selectedPaths.length === 0) return;

      setIsIngesting(true);
      const agent_id = agentsState.selectedKbAgentId === "global" ? null : agentsState.selectedKbAgentId;
      const collection_id = typeof targetCollectionId === "string" ? targetCollectionId : collectionsState.selectedCollectionId;

      let successCount = 0;
      for (let i = 0; i < selectedPaths.length; i++) {
        const path = selectedPaths[i];
        setIngestProgress(`Ingesting: ${path.split("/").pop()} (${i + 1}/${selectedPaths.length})`);
        try {
          const status = await invoke<string>("ingest_file", { filepath: path, agentId: agent_id, collectionId: collection_id });
          if (status === "completed" || status === "already_indexed") successCount++;
        } catch (err) {
          console.error(`Failed to ingest ${path}:`, err);
          showToast(`Failed to ingest ${path.split("/").pop()}: ${err}`, "error");
        }
      }
      setIngestProgress(null);
      await loadDocuments();
      if (successCount > 0) {
        showToast(`${successCount} document(s) successfully ingested into collection.`, "success");
      }
    } catch (err) {
      showToast(`Ingestion failed: ${err}`, "error");
      await loadDocuments();
    } finally {
      setIsIngesting(false);
    }
  };

  const handleIngestFolder = async () => {
    if (connectionMode === "remote") {
      showToast("Local folder ingestion is not available in Thin Client Mode.", "info");
      return;
    }
    try {
      const selectedDir = await invoke<string | null>("select_directory");
      if (!selectedDir) return;

      setIsIngesting(true);
      const agent_id = agentsState.selectedKbAgentId === "global" ? null : agentsState.selectedKbAgentId;
      const collection_id = collectionsState.selectedCollectionId;

      showToast("Ingesting folder... This may take a while.", "info");
      const count = await invoke<number>("ingest_folder", { folderpath: selectedDir, agentId: agent_id, collectionId: collection_id });
      setIngestProgress(null);
      await loadDocuments();
      showToast(`Successfully ingested ${count} file(s) from folder.`, "success");
    } catch (err) {
      showToast(`Folder ingestion failed: ${err}`, "error");
      await loadDocuments();
    } finally {
      setIsIngesting(false);
    }
  };

  const handleIngestUrl = async (url: string) => {
    if (!url.trim() || isScraping) return;
    setIsScraping(true);
    try {
      const agentId = agentsState.selectedKbAgentId === "global" ? undefined : agentsState.selectedKbAgentId;
      const collectionId = collectionsState.selectedCollectionId;
      await getApiClient().ingestUrl(url.trim(), agentId, collectionId);
      await loadDocuments();
      showToast("URL ingested successfully", "success");
    } catch (err) {
      showToast(`Scraping failed: ${err}`, "error");
    } finally {
      setIsScraping(false);
    }
  };

  const handleSelectSyncDirectory = async () => {
    try {
      const selectedDir = await invoke<string | null>("select_directory");
      if (!selectedDir) return;
      await invoke("set_sync_directory", { directory: selectedDir });
      setSyncDirectory(selectedDir);
      setTimeout(() => loadDocuments(), 1500);
      showToast("Sync directory updated", "success");
    } catch (err) {
      showToast(`Failed to set sync folder: ${err}`, "error");
    }
  };

  const handleClearSyncDirectory = async () => {
    try {
      await invoke("set_sync_directory", { directory: null });
      setSyncDirectory(null);
      showToast("Cleared sync folder", "info");
    } catch (err) {
      showToast(`Failed to clear sync folder: ${err}`, "error");
    }
  };

  const handleToggleHostServer = async () => {
    try {
      if (hostInfo.is_running) {
        await invoke("stop_host_server");
        showToast("Host server stopped", "info");
      } else {
        await invoke("start_host_server");
        showToast("Host server started", "success");
      }
      const info = await invoke<any>("get_host_info");
      setHostInfo(info);
    } catch (err) {
      showToast(`Host server toggle failed: ${err}`, "error");
    }
  };

  const handleSaveRuntimeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await getApiClient().saveSettings(runtimeSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
      showToast("Settings saved successfully", "success");
      await loadModels();
    } catch (err) {
      showToast(`Failed to save settings: ${err}`, "error");
    }
  };

  const handleSaveConnectionSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("persona_conn_mode", connectionMode);
    showToast(`Connection mode set to ${connectionMode.toUpperCase()}`, "success");
    loadModels();
    loadDocuments();
  };

  const handleClearCollection = async (colId: string) => {
    try {
      await invoke("clear_collection", { collectionId: colId });
      showToast("Collection documents cleared", "success");
      await loadDocuments();
    } catch (err) {
      showToast(`Failed to clear collection: ${err}`, "error");
    }
  };

  const handleFactoryReset = async () => {
    if (!confirmFactoryReset) {
      setConfirmFactoryReset(true);
      setTimeout(() => setConfirmFactoryReset(false), 3000);
      return;
    }
    setConfirmFactoryReset(false);
    try {
      await getApiClient().factoryReset();
      showToast("Factory reset complete. Reloading...", "success");
      window.location.reload();
    } catch (e) {
      showToast(`Factory reset failed: ${e}`, "error");
    }
  };

  const handleApproveSkill = async (skillName: string) => {
    try {
      await invoke("approve_skill", { skillName });
      await skillsState.loadSkills();
      showToast(`Approved skill ${skillName}`, "success");
    } catch (e) {
      showToast(`Failed to approve skill: ${e}`, "error");
    }
  };

  // Drag and drop image files onto chat window
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const b64 = (evt.target?.result as string).split(",")[1];
            if (b64) chatThreadsState.setAttachedImages((prev) => [...prev, b64]);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // Brain window popout mode
  if (isBrainWindow) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "#09090b", color: "white" }}>
        <KnowledgeView
          getApiClient={getApiClient}
          showToast={showToast}
          collections={collectionsState.collections}
          selectedCollectionId={collectionsState.selectedCollectionId}
          onSelectCollection={collectionsState.setSelectedCollectionId}
          onIngestFile={handleIngestFile}
          onIngestFolder={handleIngestFolder}
          onIngestUrl={handleIngestUrl}
          isIngesting={isIngesting}
          ingestProgress={ingestProgress}
          onCollectionsChanged={collectionsState.loadCollections}
        />
      </div>
    );
  }

  return (
    <>
      {showWizard && (
        <Wizard
          onComplete={() => {
            localStorage.setItem("persona_setup_complete", "true");
            setShowWizard(false);
            loadModels();
          }}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden" }}>
        {/* Top Window Titlebar */}
        <div className="top-titlebar" data-tauri-drag-region onMouseDown={handleHeaderMouseDown}>
          <div style={{ width: "80px", height: "100%" }} data-tauri-drag-region />

          <div className="titlebar-center" data-tauri-drag-region>
            <h1 className="logo" data-tauri-drag-region style={{ margin: 0, padding: 0 }}>
              <svg data-tauri-drag-region width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              PerSona
            </h1>
          </div>

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button className="icon-btn" onClick={() => setCmdPaletteOpen(true)} title="Search / Command Palette (⌘K)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>
            <button className="icon-btn" onClick={chatThreadsState.handleCreateThread} title="New Chat">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
        </div>

        <div className="app-container" style={{ flex: 1, display: "flex", overflow: "hidden", height: "auto", width: "100%" }}>
          <CommandPalette
            isOpen={cmdPaletteOpen}
            onClose={() => setCmdPaletteOpen(false)}
            threads={chatThreadsState.threads}
            onSelectThread={(id) => {
              chatThreadsState.setActiveThreadId(id);
              setActiveTab(null);
            }}
            onNewChat={chatThreadsState.handleCreateThread}
            onNavigate={(tab) => setActiveTab(tab)}
            onIngestFile={handleIngestFile}
            onIngestUrl={() => {
              setActiveTab("knowledge");
              setCmdPaletteOpen(false);
            }}
          />

          {sidebarOpen && (
            <Sidebar
              threads={chatThreadsState.threads}
              activeThreadId={chatThreadsState.activeThreadId}
              activeTab={activeTab}
              sidebarWidth={sidebarWidth}
              availableModels={availableModels}
              selectedModel={selectedModel}
              onSelectThread={(id) => {
                chatThreadsState.setActiveThreadId(id);
                setActiveTab(null);
              }}
              onDeleteThread={chatThreadsState.handleDeleteThread}
              onSelectTab={(tab) => setActiveTab(tab)}
              onSelectModel={setSelectedModel}
              onStartResizing={() => setIsResizing(true)}
              onNewChat={chatThreadsState.handleCreateThread}
            />
          )}

          <main className="main-chat" style={{ padding: 0 }}>
            {activeTab === "knowledge" && (
              <KnowledgeView
                getApiClient={getApiClient}
                showToast={showToast}
                collections={collectionsState.collections}
                selectedCollectionId={collectionsState.selectedCollectionId}
                onSelectCollection={collectionsState.setSelectedCollectionId}
                onIngestFile={handleIngestFile}
                onIngestFolder={handleIngestFolder}
                onIngestUrl={handleIngestUrl}
                isIngesting={isIngesting}
                ingestProgress={ingestProgress}
                onCollectionsChanged={collectionsState.loadCollections}
              />
            )}

            {activeTab === "collections" && (
              <CollectionsView
                collections={collectionsState.collections}
                showAddCollection={collectionsState.showAddCollection}
                editingCollectionId={collectionsState.editingCollectionId}
                newCollectionName={collectionsState.newCollectionName}
                newCollectionDesc={collectionsState.newCollectionDesc}
                onToggleAddCollection={collectionsState.showAddCollection 
                  ? () => collectionsState.setShowAddCollection(false) 
                  : collectionsState.openAddModal}
                onSaveCollection={collectionsState.handleSaveCollection}
                onDeleteCollection={collectionsState.handleDeleteCollection}
                onClearCollection={handleClearCollection}
                onEditCollection={collectionsState.openEditModal}
                onIngestFileForCollection={handleIngestFile}
                setNewCollectionName={collectionsState.setNewCollectionName}
                setNewCollectionDesc={collectionsState.setNewCollectionDesc}
              />
            )}

            {activeTab === "agents" && (
              <AgentsView
                agents={agentsState.agents}
                activeAgentId={agentsState.activeAgentId}
                skills={skillsState.skills}
                showAddAgent={agentsState.showAddAgent}
                editingAgentId={agentsState.editingAgentId}
                newAgentName={agentsState.newAgentName}
                newAgentDesc={agentsState.newAgentDesc}
                newAgentPrompt={agentsState.newAgentPrompt}
                newAgentSkills={agentsState.newAgentSkills}
                newAgentDefaultCategory={agentsState.newAgentDefaultCategory}
                onSelectAgent={agentsState.setActiveAgentId}
                onToggleAddAgent={() => agentsState.setShowAddAgent(!agentsState.showAddAgent)}
                onEditAgent={agentsState.openEditAgentModal}
                onDeleteAgent={agentsState.handleDeleteAgent}
                onSaveAgent={agentsState.handleSaveAgent}
                setNewAgentName={agentsState.setNewAgentName}
                setNewAgentDesc={agentsState.setNewAgentDesc}
                setNewAgentPrompt={agentsState.setNewAgentPrompt}
                setNewAgentSkills={agentsState.setNewAgentSkills}
                setNewAgentDefaultCategory={agentsState.setNewAgentDefaultCategory}
              />
            )}

            {activeTab === "skills" && (
              <SkillsView
                skills={skillsState.skills}
                showAddSkill={skillsState.showAddSkill}
                newSkillName={skillsState.newSkillName}
                newSkillDesc={skillsState.newSkillDesc}
                newSkillSchema={skillsState.newSkillSchema}
                newSkillCode={skillsState.newSkillCode}
                newSkillLang={skillsState.newSkillLang}
                rawEditorOpen={skillsState.rawEditorOpen}
                rawEditorSkillName={skillsState.rawEditorSkillName}
                rawToolJson={skillsState.rawToolJson}
                rawHandlerJs={skillsState.rawHandlerJs}
                onToggleAddSkill={() => skillsState.setShowAddSkill(!skillsState.showAddSkill)}
                onSaveSkill={skillsState.handleSaveSkill}
                onDeleteSkill={skillsState.handleDeleteSkill}
                onOpenRawEditor={skillsState.openRawEditor}
                onSaveRawSkill={skillsState.handleSaveRawSkill}
                onCloseRawEditor={() => skillsState.setRawEditorOpen(false)}
                onApproveSkill={handleApproveSkill}
                setNewSkillName={skillsState.setNewSkillName}
                setNewSkillDesc={skillsState.setNewSkillDesc}
                setNewSkillSchema={skillsState.setNewSkillSchema}
                setNewSkillCode={skillsState.setNewSkillCode}
                setNewSkillLang={skillsState.setNewSkillLang}
                setRawToolJson={skillsState.setRawToolJson}
                setRawHandlerJs={skillsState.setRawHandlerJs}
              />
            )}

            {activeTab === "settings" && (
              <SettingsView
                runtimeSettings={runtimeSettings}
                settingsSaved={settingsSaved}
                syncDirectory={syncDirectory}
                ollamaStatus={ollamaStatus}
                hostInfo={hostInfo}
                connectionMode={connectionMode}
                remoteIp={remoteIp}
                remotePort={remotePort}
                remotePasscode={remotePasscode}
                confirmFactoryReset={confirmFactoryReset}
                onSaveRuntimeSettings={handleSaveRuntimeSettings}
                onSelectSyncDirectory={handleSelectSyncDirectory}
                onClearSyncDirectory={handleClearSyncDirectory}
                onToggleHostServer={handleToggleHostServer}
                onSaveConnectionSettings={handleSaveConnectionSettings}
                onFactoryReset={handleFactoryReset}
                setRuntimeSettings={setRuntimeSettings}
                setConnectionMode={setConnectionMode}
                setRemoteIp={setRemoteIp}
                setRemotePort={setRemotePort}
                setRemotePasscode={setRemotePasscode}
              />
            )}

            {!activeTab && (
              <ChatView
                activeThreadId={chatThreadsState.activeThreadId}
                threads={chatThreadsState.threads}
                messages={chatThreadsState.messages}
                documents={documents}
                selectedCategoryFilter={selectedCategoryFilter}
                selectedModel={selectedModel}
                ollamaStatus={ollamaStatus}
                streamingText={chatThreadsState.streamingText}
                streamingCitations={chatThreadsState.streamingCitations}
                agentStepsText={chatThreadsState.agentStepsText}
                isGenerating={chatThreadsState.isGenerating}
                inputText={chatThreadsState.inputText}
                attachedImages={chatThreadsState.attachedImages}
                selectedMentions={chatThreadsState.selectedMentions}
                mentionOpen={chatThreadsState.mentionOpen}
                mentionQuery={chatThreadsState.mentionQuery}
                mentionSelectedIndex={chatThreadsState.mentionSelectedIndex}
                allDocs={allDocs}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                onExportChat={chatThreadsState.handleExportChat}
                onSelectCategoryFilter={async (val) => {
                  setSelectedCategoryFilter(val);
                  if (chatThreadsState.activeThreadId) {
                    try {
                      await getApiClient().setThreadCategory(chatThreadsState.activeThreadId, val === "auto" ? null : val);
                      chatThreadsState.setThreads((prev) =>
                        prev.map((t) =>
                          t.id === chatThreadsState.activeThreadId ? { ...t, category_filter: val === "auto" ? undefined : val } : t
                        )
                      );
                    } catch (err) {
                      console.error("Failed to set thread category:", err);
                    }
                  }
                }}
                onSendMessage={chatThreadsState.handleSendMessage}
                onSetInputText={chatThreadsState.setInputText}
                onAttachImages={chatThreadsState.handleAttachImages}
                onRemoveImage={chatThreadsState.handleRemoveImage}
                onRemoveMention={chatThreadsState.handleRemoveMention}
                onSelectMention={chatThreadsState.handleSelectMention}
                onKeyDownInput={(e) => chatThreadsState.handleKeyDownInput(e, allDocs, chatThreadsState.handleSendMessage)}
                onInputChange={chatThreadsState.handleInputChange}
                onRetryConnection={loadModels}
                onPreviewDocument={setPreviewDocumentId}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                isDraggingOver={isDraggingOver}
              />
            )}
          </main>
        </div>
      </div>

      {previewDocumentId && (
        <DocumentPreviewModal
          documentId={previewDocumentId}
          onClose={() => setPreviewDocumentId(null)}
          getApiClient={getApiClient}
        />
      )}
    </>
  );
}

export default App;
