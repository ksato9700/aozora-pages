import { getRecentBooks, searchBooks } from '@/lib/firestore/books';
import BookCard from '@/components/BookCard';
import SearchInput from '@/components/SearchInput';
import styles from './page.module.css';

interface Props {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function BooksPage({ searchParams }: Props) {
    const resolvedSearchParams = await searchParams;
    const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : '';

    const books = q ? await searchBooks(q) : await getRecentBooks(20);

    return (
        <main className={styles.main}>
            <div className="container">
                <header className={styles.header}>
                    <h1 className={styles.title}>Browse Books</h1>
                    <SearchInput targetRoute="/books" placeholder="Search by title..." />
                </header>

                <section>
                    <div className="mb-6 text-sm text-muted">
                        {q ? `Results for "${q}"` : 'Recently Added'}
                    </div>

                    {books.length > 0 ? (
                        <div className={styles.grid}>
                            {books.map((book) => (
                                <BookCard key={book.book_id} book={book} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.noResults}>
                            No books found matching &quot;{q}&quot;
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
}
