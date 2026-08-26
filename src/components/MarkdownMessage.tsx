import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Check, Copy } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
}

const CodeBlock = ({ match, children, rest }: any) => {
  const [copied, setCopied] = useState(false);
  const language = match ? match[1] : '';
  const codeString = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  return (
    <div className="code-block-wrapper" style={{ position: 'relative', margin: '1.5em 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
      <div className="code-block-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e1e1e', padding: '6px 12px', fontSize: '0.75rem', color: '#9b9b9b', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ textTransform: 'lowercase', fontFamily: 'monospace' }}>{language}</span>
        <button 
          onClick={handleCopy}
          style={{ background: 'transparent', border: 'none', color: '#9b9b9b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', borderRadius: '4px', transition: 'all 0.2s', fontFamily: 'var(--font-sans)', fontSize: '0.75rem' }}
          onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.color = '#9b9b9b'; e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
          {copied ? <span style={{ color: '#10b981' }}>Copied!</span> : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        {...rest}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, padding: '16px', backgroundColor: '#0d0d0d' }}
        children={codeString}
        language={language}
        style={vscDarkPlus as any}
      />
    </div>
  );
};

export const MarkdownMessage: React.FC<MarkdownMessageProps> = React.memo(({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code(props) {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          return match ? (
            <CodeBlock match={match} children={children} rest={rest} />
          ) : (
            <code {...rest} className={className}>
              {children}
            </code>
          );
        },
        a(props) {
          const { href, children, ...rest } = props;
          return (
            <a
              {...rest}
              href={href}
              onClick={async (e) => {
                e.preventDefault();
                if (href) {
                  try {
                    await openUrl(href);
                  } catch (err) {
                    console.error('Failed to open link with Tauri:', err);
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }
                }
              }}
            >
              {children}
            </a>
          );
        }
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
