import { useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { ApiAdapter, Thread, Document } from "../api_client";
import { Message } from "../components/ChatView";
import { Citation } from "../components/StreamingBubble";

export function useChatThreads(
  getApiClient: () => ApiAdapter,
  showToast: (msg: string, type: "success" | "error" | "info") => void,
  activeAgentId: string | null,
  selectedCategoryFilter: string,
  selectedModel: string
) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState<string>("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [agentStepsText, setAgentStepsText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [inputText, setInputText] = useState<string>("");
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<Document[]>([]);
  const [mentionOpen, setMentionOpen] = useState<boolean>(false);
  const [mentionQuery, setMentionQuery] = useState<string>("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState<number>(0);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState<number>(-1);

  const loadThreads = useCallback(async () => {
    try {
      const list = await getApiClient().listThreads();
      setThreads(list);
    } catch (err) {
      console.error("Failed to load threads:", err);
    }
  }, [getApiClient]);

  const loadMessages = useCallback(async (threadId: string) => {
    try {
      const history = await getApiClient().getChatHistory(threadId);
      setMessages(history);
    } catch (err) {
      console.error("Failed to load chat history:", err);
    }
  }, [getApiClient]);

  const handleCreateThread = async () => {
    const id = crypto.randomUUID();
    const title = `New Chat ${threads.length + 1}`;
    try {
      await getApiClient().createThread(id, title, activeAgentId || undefined);
      await loadThreads();
      setActiveThreadId(id);
      setMessages([]);
    } catch (err) {
      console.error("Failed to create thread:", err);
    }
  };

  const handleDeleteThread = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getApiClient().deleteThread(id);
      if (activeThreadId === id) {
        setActiveThreadId(null);
        setMessages([]);
      }
      await loadThreads();
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

  const handleExportChat = async () => {
    if (!activeThreadId) return;
    const isJson = window.confirm("Export as JSON? (Click Cancel for Markdown)");
    const format = isJson ? "json" : "md";
    try {
      const filePath = await save({
        filters: [
          {
            name: format === "json" ? "JSON Data" : "Markdown Document",
            extensions: [format],
          },
        ],
        defaultPath: `chat_export.${format}`,
      });
      if (filePath) {
        await getApiClient().exportChatThread(activeThreadId, format, filePath);
        showToast("Chat exported successfully", "success");
      }
    } catch (err) {
      showToast(`Export failed: ${err}`, "error");
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && attachedImages.length === 0) return;
    if (!activeThreadId || isGenerating) return;

    const userMsgContent = inputText;
    const userImages = [...attachedImages];
    const mentionedDocIds = selectedMentions.map((d) => d.id);

    // Reset input fields
    setInputText("");
    setAttachedImages([]);
    setSelectedMentions([]);
    setMentionOpen(false);

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: crypto.randomUUID(),
      thread_id: activeThreadId,
      role: "user",
      content: userMsgContent,
      created_at: new Date().toISOString(),
      images: userImages.length > 0 ? userImages : undefined,
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setIsGenerating(true);
    setStreamingText("");
    setStreamingCitations([]);
    setAgentStepsText("");

    try {
      let accumText = "";
      let accumCitations: Citation[] = [];

      await getApiClient().sendChatMessage(
        activeThreadId,
        userMsgContent,
        selectedModel,
        selectedCategoryFilter === "auto" ? null : selectedCategoryFilter,
        userImages.length > 0 ? userImages : undefined,
        mentionedDocIds.length > 0 ? mentionedDocIds : undefined,
        (data: any) => {
          if (data.token) {
            accumText += data.token;
            setStreamingText(accumText);
          }
          if (data.citations) {
            accumCitations = data.citations;
            setStreamingCitations(accumCitations);
          }
          if (data.agent_step) {
            setAgentStepsText((prev) => (prev ? prev + "\n" + data.agent_step : data.agent_step));
          }
        }
      );

      // Refresh final messages
      await loadMessages(activeThreadId);
    } catch (err: any) {
      showToast(`Message failed: ${err.message || err}`, "error");
    } finally {
      setIsGenerating(false);
      setStreamingText("");
      setStreamingCitations([]);
      setAgentStepsText("");
    }
  };

  const handleAttachImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64String = (event.target?.result as string).split(",")[1];
        if (base64String) {
          setAttachedImages((prev) => [...prev, base64String]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveMention = (id: string) => {
    setSelectedMentions((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSelectMention = (doc: Document) => {
    if (!selectedMentions.some((d) => d.id === doc.id)) {
      setSelectedMentions((prev) => [...prev, doc]);
    }
    if (mentionTriggerIndex >= 0) {
      const beforeStr = inputText.substring(0, mentionTriggerIndex);
      setInputText(beforeStr);
    }
    setMentionOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    const lastAtIndex = val.lastIndexOf("@");
    if (lastAtIndex !== -1 && (lastAtIndex === 0 || val[lastAtIndex - 1] === " ")) {
      const query = val.substring(lastAtIndex + 1);
      if (!query.includes(" ")) {
        setMentionOpen(true);
        setMentionQuery(query);
        setMentionTriggerIndex(lastAtIndex);
        setMentionSelectedIndex(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const handleKeyDownInput = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    allDocs: Document[],
    onSendMessage: (e?: React.FormEvent) => void
  ) => {
    if (mentionOpen) {
      const matches = allDocs.filter((d) =>
        d.filepath.toLowerCase().includes(mentionQuery.toLowerCase())
      );

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % Math.max(matches.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + matches.length) % Math.max(matches.length, 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (matches[mentionSelectedIndex]) {
          handleSelectMention(matches[mentionSelectedIndex]);
        }
      } else if (e.key === "Escape") {
        setMentionOpen(false);
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  return {
    threads,
    setThreads,
    activeThreadId,
    setActiveThreadId,
    messages,
    streamingText,
    streamingCitations,
    agentStepsText,
    isGenerating,
    inputText,
    setInputText,
    attachedImages,
    setAttachedImages,
    selectedMentions,
    mentionOpen,
    mentionQuery,
    mentionSelectedIndex,
    loadThreads,
    loadMessages,
    handleCreateThread,
    handleDeleteThread,
    handleExportChat,
    handleSendMessage,
    handleAttachImages,
    handleRemoveImage,
    handleRemoveMention,
    handleSelectMention,
    handleInputChange,
    handleKeyDownInput,
  };
}
