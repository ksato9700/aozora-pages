'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useDebounce } from 'use-debounce';
import { search, SearchResult } from '@/app/actions';
import { Book, Person } from '@/types/aozora';
import styles from './SearchSection.module.css'; // We'll create this or use inline styles

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

        const performSearch = async () => {
            setLoading(true);
            try {
                const data = await search(debouncedQuery);
                setResults(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        performSearch();
    }, [debouncedQuery]);

    const hasResults = results.books.length > 0 || results.persons.length > 0;

    return (
        <section className="my-12 relative z-50">
            <div className={`max-w-4xl mx-auto w-full transition-all duration-200 ${hasResults ? 'bg-white rounded-[28px] shadow-2xl' : ''}`}>
                <div
                    style={{ width: '100%', display: 'flex', alignItems: 'center', backgroundColor: '#ffffff' }}
                    className={`border-2 border-gray-200 focus-within:border-cyan-400 focus-within:ring-4 focus-within:ring-cyan-400/20 transition-all px-8 py-6 group ${hasResults ? 'rounded-t-[28px] border-b-0' : 'rounded-full shadow-xl'}`}
                >
                    <svg
                        style={{ width: '28px', height: '28px', minWidth: '28px' }}
                        className="text-gray-500 group-focus-within:text-cyan-600 transition-colors flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="作品名・著者名で検索..."
                        style={{ flex: 1, minWidth: 0, marginLeft: '1.5rem', outline: 'none', border: 'none', background: 'transparent', fontSize: '28px', color: '#000000', lineHeight: '1.5', position: 'relative', zIndex: 10 }}
                        className="placeholder-gray-400 focus:outline-none focus:ring-0"
                    />
                    {loading && (
                        <div className="ml-4 flex-shrink-0">
                            <div className="animate-spin h-6 w-6 border-2 border-cyan-400 rounded-full border-t-transparent"></div>
                        </div>
                    )}
                </div>

                {hasResults && (
                    <div className="bg-white rounded-b-[28px] border-2 border-t-0 border-gray-200 overflow-hidden pb-4 absolute w-full left-0 shadow-2xl top-[calc(100%-2px)]">
                        <div className="h-[1px] bg-gray-200 mx-4 mb-2"></div>
                        <ul className="py-2">
                            {results.persons.map(person => (
                                <li key={person.person_id}>
                                    <Link href={`/persons/${person.person_id}`} className="flex items-center px-8 py-3 hover:bg-gray-100 transition-colors text-gray-700">
                                        <svg
                                            style={{ width: '24px', height: '24px', minWidth: '24px' }}
                                            className="text-gray-400 mr-4 flex-shrink-0"
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <span className="flex-1 truncate" style={{ fontSize: '28px' }}>
                                            {person.last_name} {person.first_name}
                                            <span className="text-gray-400 ml-3" style={{ fontSize: '18px' }}>({person.last_name_yomi})</span>
                                        </span>
                                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded ml-2">著者</span>
                                    </Link>
                                </li>
                            ))}
                            {results.books.map(book => (
                                <li key={book.book_id}>
                                    <Link href={`/books/${book.book_id}`} className="flex items-center px-8 py-3 hover:bg-gray-100 transition-colors text-gray-700">
                                        <svg
                                            style={{ width: '24px', height: '24px', minWidth: '24px' }}
                                            className="text-gray-400 mr-4 flex-shrink-0"
                                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                                        >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                        <span className="flex-1 truncate flex items-baseline">
                                            <span style={{ fontSize: '28px' }}>{book.title}</span>
                                            {book.authorName && <span className="text-gray-500 ml-3" style={{ fontSize: '18px' }}>- {book.authorName}</span>}
                                        </span>
                                        {book.font_kana_type && (
                                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded whitespace-nowrap ml-2">
                                                {book.font_kana_type}
                                            </span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </section>
    );
}
