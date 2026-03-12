import Link from 'next/link';
import { getRecentBooks } from '@/lib/firestore/books';
import BookCard from '@/components/BookCard';
import styles from '../../page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function NewBooksPage({ searchParams }: Props) {
    const resolvedSearchParams = await searchParams;
    const after = typeof resolvedSearchParams.after === 'string' ? resolvedSearchParams.after : undefined;

    const books = await getRecentBooks(PAGE_SIZE + 1, after);
    const hasMore = books.length > PAGE_SIZE;
    const visibleBooks = hasMore ? books.slice(0, PAGE_SIZE) : books;
    const nextCursor = hasMore ? visibleBooks[visibleBooks.length - 1].release_date : null;

    return (
        <main className={styles.main}>
            <div className="container">
                <header className={styles.header}>
                    <div className="mb-4">
                        <Link href="/" className="text-muted hover:text-white transition-colors">
                            &larr; Back to Home
                        </Link>
                    </div>
                    <h1 className={styles.title} style={{ fontSize: '2.5rem' }}>
                        <span className="text-gradient">新着図書</span>
                    </h1>
                </header>

                <section>
                    {visibleBooks.length > 0 ? (
                        <>
                            <div className={styles.grid}>
                                {visibleBooks.map((book) => (
                                    <BookCard key={book.book_id} book={book} authorName={book.author_name} />
                                ))}
                            </div>

                            <div className="flex justify-between items-center mt-8">
                                {after ? (
                                    <Link href="/books/new" className="btn btn-secondary">
                                        &larr; First page
                                    </Link>
                                ) : (
                                    <span />
                                )}
                                {nextCursor && (
                                    <Link href={`/books/new?after=${nextCursor}`} className="btn btn-secondary">
                                        Next &rarr;
                                    </Link>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="glass-panel p-8 text-center rounded-xl">
                            <p className="text-muted">No books found. Check database connection.</p>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
