import { useState, useEffect } from 'react';

interface Props {
  bookId: string;
  textUrl: string;
  title: string;
  htmlUrl?: string;
}

export default function ReaderIsland({ bookId, textUrl, title, htmlUrl }: Props) {
  const [mode, setMode] = useState<'text' | 'html'>(() => {
    if (typeof window === 'undefined') return 'html';
    const p = new URLSearchParams(window.location.search);
    return p.get('format') === 'text' ? 'text' : 'html';
  });

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'text' || !textUrl) return;

    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`/api/read?src=${encodeURIComponent(textUrl)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => { if (!cancelled) setContent(text); })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [mode, textUrl]);

  const switchMode = (newMode: 'text' | 'html') => {
    setMode(newMode);
    const url = new URL(window.location.href);
    url.searchParams.set('format', newMode);
    window.history.replaceState(null, '', url.toString());
  };

  const iframeTarget = htmlUrl ?? `https://aozora.ksato9700.com/${bookId.padStart(6, '0')}.utf8.html`;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <button
          onClick={() => switchMode('html')}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid',
            cursor: 'pointer',
            fontSize: '0.875rem',
            background: mode === 'html' ? 'var(--primary)' : 'transparent',
            color: mode === 'html' ? '#0f172a' : 'var(--muted)',
            borderColor: mode === 'html' ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
          }}
        >
          HTMLモード
        </button>
        <button
          onClick={() => switchMode('text')}
          style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '9999px',
            border: '1px solid',
            cursor: 'pointer',
            fontSize: '0.875rem',
            background: mode === 'text' ? 'var(--primary)' : 'transparent',
            color: mode === 'text' ? '#0f172a' : 'var(--muted)',
            borderColor: mode === 'text' ? 'var(--primary)' : 'rgba(255,255,255,0.2)',
          }}
        >
          テキストモード
        </button>
      </div>

      {/* Content area */}
      {mode === 'html' ? (
        <iframe
          src={iframeTarget}
          style={{ flex: 1, width: '100%', border: 'none', background: 'white' }}
          title={title}
        />
      ) : loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
          読み込み中...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexDirection: 'column', gap: '1rem' }}>
          <p>読み込みエラー。HTMLモードを試してください。</p>
          <button onClick={() => switchMode('html')} style={{ padding: '0.5rem 1.5rem', background: 'var(--primary)', color: '#0f172a', border: 'none', borderRadius: '9999px', cursor: 'pointer' }}>
            HTMLモードへ切り替え
          </button>
        </div>
      ) : (
        <div style={{
          flex: 1,
          background: '#fdfaf6',
          color: '#1a1a1a',
          padding: '4rem 2rem',
          overflowX: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            writingMode: 'vertical-rl',
            WebkitWritingMode: 'vertical-rl',
            textOrientation: 'mixed',
            lineHeight: 1.8,
            fontFamily: 'var(--font-serif)',
            fontSize: '1.25rem',
            height: '80vh',
            whiteSpace: 'pre-wrap',
            maxWidth: '100%',
          }}>
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
