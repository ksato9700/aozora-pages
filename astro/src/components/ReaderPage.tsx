import { useState, useEffect } from 'react';
import ReaderIsland from './ReaderIsland';

interface ReaderBook {
  title: string;
  text_url?: string;
  html_url?: string;
  copyright: boolean;
}

export default function ReaderPage() {
  const [book, setBook] = useState<(ReaderBook & { bookId: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const bookId = window.location.pathname.split('/')[2] ?? '';
    if (!bookId) {
      setError('URLにBook IDが見つかりません');
      setLoading(false);
      return;
    }

    fetch('/api/books-for-reader.json')
      .then((res) => res.json())
      .then((data: Record<string, ReaderBook>) => {
        const bookData = data[bookId];
        if (!bookData) {
          setError(`作品 ${bookId} が見つかりません`);
        } else {
          setBook({ ...bookData, bookId });
          document.title = `${bookData.title} — 読む — Aozora Pages`;
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        読み込み中...
      </div>
    );
  }

  if (error || !book) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
        {error || 'エラーが発生しました'}
      </div>
    );
  }

  const htmlUrl = !book.copyright
    ? `https://aozora.ksato9700.com/${book.bookId.padStart(6, '0')}.utf8.html`
    : (book.html_url ?? undefined);

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header style={{
        padding: '1rem 2rem',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <a
          href={`/books/${book.bookId}`}
          style={{ color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600 }}
        >
          ← 詳細に戻る
        </a>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
          {book.title}
        </h1>
      </header>

      {book.text_url || htmlUrl ? (
        <ReaderIsland
          bookId={book.bookId}
          textUrl={book.text_url ?? ''}
          title={book.title}
          htmlUrl={htmlUrl}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="text-muted">このコンテンツは利用できません。</p>
        </div>
      )}
    </main>
  );
}
