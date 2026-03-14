'use client';

import { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { liteClient as algoliasearch } from 'algoliasearch/lite';
import type { Book, Person } from '../types/aozora';

type EnrichedBook = Book & { authorName?: string };
type SearchResult = { books: EnrichedBook[]; persons: Person[] };

const client = algoliasearch(
  import.meta.env.PUBLIC_ALGOLIA_APP_ID as string,
  import.meta.env.PUBLIC_ALGOLIA_SEARCH_KEY as string,
);

async function unifiedSearch(query: string): Promise<SearchResult> {
  const { results } = await client.search<EnrichedBook | Person>({
    requests: [
      { indexName: 'books', query, hitsPerPage: 10 },
      { indexName: 'persons', query, hitsPerPage: 10 },
    ],
  });

  if (!results || results.length < 2) return { books: [], persons: [] };

  const booksResponse = results[0] as { hits: EnrichedBook[] };
  const personsResponse = results[1] as { hits: Person[] };

  return {
    books: booksResponse.hits ?? [],
    persons: personsResponse.hits ?? [],
  };
}

export default function SearchSection() {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [results, setResults] = useState<SearchResult>({ books: [], persons: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults({ books: [], persons: [] });
      return;
    }

    let cancelled = false;
    setLoading(true);

    unifiedSearch(debouncedQuery)
      .then((data) => { if (!cancelled) setResults(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  const hasResults = results.books.length > 0 || results.persons.length > 0;

  return (
    <section style={{ margin: '3rem 0', position: 'relative', zIndex: 50 }}>
      <div
        style={{
          maxWidth: '64rem',
          margin: '0 auto',
          width: '100%',
          transition: 'all 0.2s',
          background: hasResults ? 'white' : undefined,
          borderRadius: hasResults ? '28px' : undefined,
          boxShadow: hasResults ? '0 25px 50px -12px rgba(0,0,0,0.25)' : undefined,
        }}
      >
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#ffffff',
            border: '2px solid #e5e7eb',
            padding: '1.5rem 2rem',
            borderRadius: hasResults ? '28px 28px 0 0' : '9999px',
            borderBottom: hasResults ? 'none' : undefined,
            boxShadow: hasResults ? 'none' : '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#6b7280" style={{ flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="作品名・著者名で検索..."
            style={{
              flex: 1,
              minWidth: 0,
              marginLeft: '1.5rem',
              outline: 'none',
              border: 'none',
              background: 'transparent',
              fontSize: '28px',
              color: '#000000',
              lineHeight: '1.5',
            }}
          />
          {loading && (
            <div style={{ marginLeft: '1rem', flexShrink: 0 }}>
              <div style={{
                width: '1.5rem',
                height: '1.5rem',
                border: '2px solid #22d3ee',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 0.6s linear infinite',
              }} />
            </div>
          )}
        </div>

        {hasResults && (
          <div style={{
            background: 'white',
            borderRadius: '0 0 28px 28px',
            border: '2px solid #e5e7eb',
            borderTop: 'none',
            overflow: 'hidden',
            paddingBottom: '1rem',
            position: 'absolute',
            width: '100%',
            left: 0,
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}>
            <div style={{ height: '1px', background: '#e5e7eb', margin: '0 1rem 0.5rem' }} />
            <ul style={{ listStyle: 'none', padding: '0.5rem 0' }}>
              {results.persons.map((person) => (
                <li key={person.person_id}>
                  <a
                    href={`/persons/${String(person.person_id).padStart(6, '0')}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem 2rem',
                      color: '#374151',
                      textDecoration: 'none',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" style={{ flexShrink: 0, marginRight: '1rem' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '28px' }}>
                      {person.last_name} {person.first_name}
                      <span style={{ color: '#9ca3af', marginLeft: '0.75rem', fontSize: '18px' }}>({person.last_name_yomi})</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px', marginLeft: '0.5rem' }}>著者</span>
                  </a>
                </li>
              ))}
              {results.books.map((book) => (
                <li key={book.book_id}>
                  <a
                    href={`/books/${String(book.book_id).padStart(6, '0')}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem 2rem',
                      color: '#374151',
                      textDecoration: 'none',
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = '#f3f4f6')}
                    onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" style={{ flexShrink: 0, marginRight: '1rem' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '28px' }}>{book.title}</span>
                      {book.authorName && <span style={{ color: '#6b7280', marginLeft: '0.75rem', fontSize: '18px' }}>- {book.authorName}</span>}
                    </span>
                    {book.font_kana_type && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px', marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                        {book.font_kana_type}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
