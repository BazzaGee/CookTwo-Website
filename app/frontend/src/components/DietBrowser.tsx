import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDietArticles, useDietArticle } from '../hooks/useDietInfo';

interface DietBrowserProps {
  dietKey: string;
  onClose: () => void;
}

export default function DietBrowser({ dietKey, onClose }: DietBrowserProps) {
  const { data: articles = [] } = useDietArticles(dietKey);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  useEffect(() => {
    if (articles.length > 0 && !activeSlug) {
      setActiveSlug(articles[0]?.fileSlug ?? null);
    }
  }, [articles, activeSlug]);

  const { data: article, isLoading } = useDietArticle(dietKey, activeSlug);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="bg-cream flex flex-col h-full md:h-[90vh] md:max-w-3xl md:mx-auto md:my-auto md:rounded-2xl md:border md:border-border overflow-hidden w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-white">
          <div className="flex gap-1 overflow-x-auto">
            {articles.map((a) => (
              <button
                key={a.fileSlug}
                onClick={() => setActiveSlug(a.fileSlug)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  activeSlug === a.fileSlug
                    ? 'bg-sage text-white'
                    : 'text-text-secondary hover:bg-cream'
                }`}
              >
                {a.title}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl leading-none ml-2 shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
          {isLoading ? (
            <p className="text-text-secondary text-sm text-center">Loading…</p>
          ) : article ? (
            <article className="prose-content max-w-none">
              <h1 className="text-text-primary text-2xl font-semibold mb-4">{article.title}</h1>
              <MarkdownContent content={article.content} />
            </article>
          ) : (
            <p className="text-text-secondary text-sm text-center">No content available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h2 className="text-text-primary text-xl font-semibold mt-6 mb-3">{children}</h2>,
          h2: ({ children }) => <h3 className="text-text-primary text-lg font-semibold mt-5 mb-2">{children}</h3>,
          h3: ({ children }) => <h4 className="text-text-primary text-base font-semibold mt-4 mb-2">{children}</h4>,
          p: ({ children }) => <p className="text-text-primary text-sm leading-relaxed my-3">{children}</p>,
          ul: ({ children }) => <ul className="text-text-primary text-sm leading-relaxed my-3 space-y-1 ml-4 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="text-text-primary text-sm leading-relaxed my-3 space-y-1 ml-4 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="text-text-primary text-sm">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
          em: ({ children }) => <em className="italic text-text-primary">{children}</em>,
          blockquote: ({ children }) => <blockquote className="border-l-4 border-sage/40 pl-4 my-4 text-text-secondary text-sm italic">{children}</blockquote>,
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-');
            if (isBlock) {
              return <pre className="bg-text-primary/5 border border-border rounded-lg p-3 my-3 overflow-x-auto text-xs"><code className="text-text-primary font-mono">{children}</code></pre>;
            }
            return <code className="bg-text-primary/5 text-text-primary px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-sage hover:text-sage-dark underline text-sm">{children}</a>,
          table: ({ children }) => <div className="overflow-x-auto my-4"><table className="w-full text-xs border-collapse">{children}</table></div>,
          th: ({ children }) => <th className="border border-border bg-cream px-2 py-1 text-left font-semibold text-text-primary">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1 text-text-primary">{children}</td>,
          hr: () => <hr className="border-border my-6" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
