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
      setStep("ollama_error"); // If we can't list models, Ollama might have crashed
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
      // Even if it fails, we move on or show error, but let's just move on for onboarding
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
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'var(--bg-obsidian)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-main)',
      fontFamily: 'var(--font-sans)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        padding: '40px',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-premium)',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        border: '1px solid var(--border-light)'
      }}>
        <h1 style={{ 
          marginBottom: '20px', 
          background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Welcome to PerSona
        </h1>
        
        {step === "checking_ollama" && (
          <div>
            <div className="spinner" style={{ margin: '0 auto 15px auto', width: '30px', height: '30px', borderTopColor: 'var(--accent-violet)' }}></div>
            <p>Connecting to local Ollama daemon...</p>
          </div>
        )}

        {step === "ollama_error" && (
          <div>
            <div style={{ color: '#ef4444', marginBottom: '15px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto' }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h3 style={{ marginBottom: '10px' }}>Ollama Not Found</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
              PerSona runs 100% locally and requires the Ollama daemon to be running on your machine.
              Please install Ollama from ollama.com, start it, and then try again.
            </p>
            <button 
              onClick={checkOllama}
              style={{
                background: 'linear-gradient(135deg, var(--accent-violet) 0%, #7c3aed 100%)',
                color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
              }}
            >
              Check Again
            </button>
          </div>
        )}

        {step === "checking_models" && (
          <div>
            <div className="spinner" style={{ margin: '0 auto 15px auto', width: '30px', height: '30px', borderTopColor: 'var(--accent-violet)' }}></div>
            <p>Verifying required AI models...</p>
          </div>
        )}

        {step === "pulling_models" && (
          <div>
            <h3 style={{ marginBottom: '10px' }}>Downloading Required Models</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
              Downloading <strong>{currentModel}</strong>... This may take a while depending on your internet connection.
            </p>
            
            <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--bg-input)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
              <div style={{ 
                height: '100%', 
                width: `${pullProgress}%`, 
                backgroundColor: 'var(--accent-violet)',
                transition: 'width 0.3s ease'
              }}></div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pullStatus} {pullProgress > 0 && `(${Math.round(pullProgress)}%)`}</p>
          </div>
        )}

        {step === "ingest_document" && (
          <div>
            <div style={{ color: 'var(--accent-violet)', marginBottom: '15px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto' }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="12" y1="18" x2="12" y2="12"></line>
                <line x1="9" y1="15" x2="15" y2="15"></line>
              </svg>
            </div>
            <h3 style={{ marginBottom: '10px' }}>Add Your First Document</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '0.9rem' }}>
              PerSona's Knowledge Base allows you to chat with your own documents. Ingest your first PDF, DOCX, TXT, or Markdown file to get started!
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={handleIngestFile}
                disabled={isIngesting}
                style={{
                  background: 'linear-gradient(135deg, var(--accent-violet) 0%, #7c3aed 100%)',
                  color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: isIngesting ? 'not-allowed' : 'pointer', fontWeight: 600, width: '100%', maxWidth: '250px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}
              >
                {isIngesting ? (
                  <>
                    <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'white', borderWidth: '2px' }}></div>
                    Ingesting...
                  </>
                ) : (
                  "Browse Files"
                )}
              </button>
              
              <button 
                onClick={handleSkipIngest}
                disabled={isIngesting}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)', border: '1px solid var(--border-light)', padding: '10px 24px', borderRadius: '8px', cursor: isIngesting ? 'not-allowed' : 'pointer', fontWeight: 500, width: '100%', maxWidth: '250px'
                }}
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div>
            <div style={{ color: '#10b981', marginBottom: '15px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto' }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h3>You're All Set!</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '10px', fontSize: '0.9rem' }}>
              Launching PerSona...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
