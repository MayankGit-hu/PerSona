import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface WizardProps {
  onComplete: () => void;
}

interface PullProgress {
  status: string;
  digest: string | null;
  total: number | null;
  completed: number | null;
}

export function Wizard({ onComplete }: WizardProps) {
  const [step, setStep] = useState<"checking_ollama" | "ollama_error" | "checking_models" | "pulling_models" | "ingest_document" | "done">("checking_ollama");
  const [isIngesting, setIsIngesting] = useState(false);
  const [pullStatus, setPullStatus] = useState<string>("");
  const [pullProgress, setPullProgress] = useState<number>(0);
  const [currentModel, setCurrentModel] = useState<string>("");

  useEffect(() => {
    checkOllama();
  }, []);

  useEffect(() => {
    const unlisten = listen<PullProgress>("model-pull-progress", (event) => {
      const data = event.payload;
      setPullStatus(data.status);
      if (data.total && data.completed) {
        setPullProgress((data.completed / data.total) * 100);
      }
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const checkOllama = async () => {
    setStep("checking_ollama");
    try {
      const isRunning = await invoke<boolean>("check_ollama_status");
      if (!isRunning) {
        setStep("ollama_error");
      } else {
        checkModels();
      }
    } catch (e) {
      setStep("ollama_error");
    }
  };

  const checkModels = async () => {
    setStep("checking_models");
    try {
      const availableModels = await invoke<string[]>("list_local_models");
      const hasLlama3 = availableModels.some(m => m.startsWith("llama3.2") || m === "llama3.2:latest");
      const hasNomic = availableModels.some(m => m.startsWith("nomic-embed-text") || m === "nomic-embed-text:latest");

      const missingModels: string[] = [];
      if (!hasLlama3) missingModels.push("llama3.2:latest");
      if (!hasNomic) missingModels.push("nomic-embed-text:latest");

      if (missingModels.length > 0) {
        setStep("pulling_models");
        for (const model of missingModels) {
          setCurrentModel(model);
          setPullStatus("Initializing...");
          setPullProgress(0);
          await invoke("pull_model", { modelName: model });
        }
      }
      
      setStep("ingest_document");
    } catch (e) {
      console.error("Error checking/pulling models:", e);
      setStep("ollama_error");
    }
  };

  const handleIngestFile = async () => {
    try {
      const selectedPath = await invoke<string | null>("select_file");
      if (!selectedPath) return;

      setIsIngesting(true);
      await invoke<string>("ingest_file", { filepath: selectedPath, agentId: null });
      setStep("done");
      setTimeout(() => onComplete(), 1000);
    } catch (err) {
      console.error("Ingestion failed:", err);
      setStep("done");
      setTimeout(() => onComplete(), 1000);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleSkipIngest = () => {
    setStep("done");
    setTimeout(() => onComplete(), 1000);
  };

  return (
    <div className="wizard-overlay">
      <div className="wizard-card">

        {/* Checking Ollama */}
        {step === "checking_ollama" && (
          <>
            <div className="wizard-icon">🔌</div>
            <h2 className="wizard-title">Connecting to Ollama</h2>
            <p className="wizard-body">Looking for a local Ollama daemon...</p>
            <div className="spinner" />
          </>
        )}

        {/* Ollama Error */}
        {step === "ollama_error" && (
          <>
            <div className="wizard-icon" style={{ background: 'rgba(244,63,94,0.2)', boxShadow: '0 8px 24px rgba(244,63,94,0.3)' }}>⚠️</div>
            <h2 className="wizard-title">Ollama Not Found</h2>
            <p className="wizard-body">
              PerSona runs 100% locally and needs the Ollama daemon running on your machine.
              Install it from <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--violet-hi)' }}>ollama.com</a>, start it, and click below.
            </p>
            <button className="btn-primary" onClick={checkOllama} style={{ width: '100%', justifyContent: 'center' }}>
              Check Again
            </button>
          </>
        )}

        {/* Checking Models */}
        {step === "checking_models" && (
          <>
            <div className="wizard-icon">🔍</div>
            <h2 className="wizard-title">Verifying Models</h2>
            <p className="wizard-body">Checking for required AI models...</p>
            <div className="spinner" />
          </>
        )}

        {/* Pulling Models */}
        {step === "pulling_models" && (
          <>
            <div className="wizard-icon">⬇️</div>
            <h2 className="wizard-title">Downloading Models</h2>
            <p className="wizard-body">
              Downloading <strong style={{ color: 'var(--violet-hi)' }}>{currentModel}</strong>...
              This may take a moment depending on your connection.
            </p>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${pullProgress}%` }} />
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '6px' }}>
              {pullStatus}{pullProgress > 0 ? ` — ${Math.round(pullProgress)}%` : ''}
            </p>
          </>
        )}

        {/* Ingest Document */}
        {step === "ingest_document" && (
          <>
            <div className="wizard-icon">📄</div>
            <h2 className="wizard-title">Add Your First Document</h2>
            <p className="wizard-body">
              PerSona's Knowledge Base lets you chat with your own PDFs, docs, and notes. Ingest your first file to get started!
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn-primary"
                onClick={handleIngestFile}
                disabled={isIngesting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {isIngesting ? (
                  <>
                    <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: 'white' }} />
                    Ingesting...
                  </>
                ) : '📂 Browse Files'}
              </button>
              <button
                className="btn-secondary"
                onClick={handleSkipIngest}
                disabled={isIngesting}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* Done */}
        {step === "done" && (
          <>
            <div className="wizard-icon" style={{ background: 'rgba(16,185,129,0.2)', boxShadow: '0 8px 24px rgba(16,185,129,0.3)' }}>✓</div>
            <h2 className="wizard-title">You're All Set!</h2>
            <p className="wizard-body">Launching PerSona...</p>
            <div className="spinner" />
          </>
        )}
      </div>
    </div>
  );
}
