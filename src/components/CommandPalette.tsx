import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Thread } from '../api_client';

interface CommandAction {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  threads: Thread[];
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onNavigate: (tab: 'knowledge' | 'brain' | 'skills' | 'settings' | 'agents') => void;
  onIngestFile: () => void;
  onIngestUrl: () => void;
}

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

const ChatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const BookIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);

const AgentIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

const SkillIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 4.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  threads,
  onSelectThread,
  onNewChat,
  onNavigate,
  onIngestFile,
  onIngestUrl,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const staticActions: CommandAction[] = [
    {
      id: 'new-chat',
      label: 'New Chat',
      description: 'Start a fresh conversation',
      icon: <PlusIcon />,
      category: 'Actions',
      keywords: ['create', 'new', 'conversation', 'thread'],
      action: () => { onNewChat(); onClose(); },
    },
    {
      id: 'ingest-file',
      label: 'Ingest File',
      description: 'Add a document to the knowledge base',
      icon: <UploadIcon />,
      category: 'Actions',
      keywords: ['upload', 'file', 'document', 'pdf', 'add', 'knowledge'],
      action: () => { onIngestFile(); onClose(); },
    },
    {
      id: 'ingest-url',
      label: 'Ingest Web Page',
      description: 'Scrape a URL into the knowledge base',
      icon: <GlobeIcon />,
      category: 'Actions',
      keywords: ['url', 'web', 'page', 'scrape', 'website', 'link'],
      action: () => { onIngestUrl(); onClose(); },
    },
    {
      id: 'nav-knowledge',
      label: 'Go to Knowledge Base',
      description: 'View & manage your documents',
      icon: <BookIcon />,
      category: 'Navigation',
      keywords: ['knowledge', 'documents', 'library', 'brain', 'files'],
      action: () => { onNavigate('brain'); onClose(); },
    },
    {
      id: 'nav-agents',
      label: 'Go to Agents',
      description: 'Manage your AI agents',
      icon: <AgentIcon />,
      category: 'Navigation',
      keywords: ['agents', 'bots', 'personas'],
      action: () => { onNavigate('agents'); onClose(); },
    },
    {
      id: 'nav-skills',
      label: 'Go to Skills',
      description: 'Browse & manage skills',
      icon: <SkillIcon />,
      category: 'Navigation',
      keywords: ['skills', 'tools', 'scripts'],
      action: () => { onNavigate('skills'); onClose(); },
    },
    {
      id: 'nav-settings',
      label: 'Go to Settings',
      description: 'Configure models and runtime',
      icon: <SettingsIcon />,
      category: 'Navigation',
      keywords: ['settings', 'config', 'model', 'gpu', 'context'],
      action: () => { onNavigate('settings'); onClose(); },
    },
  ];

  const threadActions: CommandAction[] = threads.map(t => ({
    id: `thread-${t.id}`,
    label: t.title,
    description: 'Open conversation',
    icon: <ChatIcon />,
    category: 'Threads',
    keywords: [t.title.toLowerCase()],
    action: () => { onSelectThread(t.id); onClose(); },
  }));

  const allActions = [...staticActions, ...threadActions];

  const filtered = query.trim() === ''
    ? allActions
    : allActions.filter(a => {
        const q = query.toLowerCase();
        return (
          a.label.toLowerCase().includes(q) ||
          (a.description?.toLowerCase().includes(q) ?? false) ||
          (a.keywords?.some(k => k.includes(q)) ?? false) ||
          a.category.toLowerCase().includes(q)
        );
      });

  // Group by category
  const grouped = filtered.reduce<Record<string, CommandAction[]>>((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {});

  const flatList = Object.values(grouped).flat();

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) flatList[selectedIndex].action();
    }
  }, [flatList, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Reset selected index when query changes
  useEffect(() => { setSelectedIndex(0); }, [query]);

  if (!isOpen) return null;

  let globalIndex = 0;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div
        className="cmd-palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="cmd-input-wrap">
          <span className="cmd-search-icon"><SearchIcon /></span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-input"
            placeholder="Search commands, chats, tabs..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="cmd-esc-badge">esc</kbd>
        </div>

        {/* Results */}
        <div className="cmd-results" ref={listRef}>
          {Object.entries(grouped).length === 0 ? (
            <div className="cmd-empty">No results for "{query}"</div>
          ) : (
            Object.entries(grouped).map(([category, actions]) => (
              <div key={category} className="cmd-group">
                <div className="cmd-group-label">{category}</div>
                {actions.map(action => {
                  const idx = globalIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={action.id}
                      data-index={idx}
                      className={`cmd-item ${isSelected ? 'selected' : ''}`}
                      onClick={action.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <span className="cmd-item-icon">{action.icon}</span>
                      <div className="cmd-item-text">
                        <span className="cmd-item-label">{action.label}</span>
                        {action.description && (
                          <span className="cmd-item-desc">{action.description}</span>
                        )}
                      </div>
                      {isSelected && <kbd className="cmd-enter-badge">↵</kbd>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="cmd-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
};
