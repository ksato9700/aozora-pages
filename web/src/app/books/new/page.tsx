import Link from 'next/link';
import { getRecentBooks } from '@/lib/firestore/books';
import BookCard from '@/components/BookCard';
import styles from '../../page.module.css';
import { getContributorsForBook } from '@/lib/firestore/contributors';

export const dynamic = 'force-dynamic';

export default async function NewBooksPage() {
    const recentBooks = await getRecentBooks(50);

    const authors: Record<string, string> = {};
    await Promise.all(recentBooks.map(async (book) => {
        const contributors = await getContributorsForBook(book.book_id);
        const author = contributors.find(c => c.role === 0) || contributors[0];
        if (author) {
            authors[book.book_id] = `${author.person.last_name} ${author.person.first_name}`;
        }
    }));

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
                    {recentBooks.length > 0 ? (
                        <div className={styles.grid}>
                            {recentBooks.map((book) => (
                                <BookCard key={book.book_id} book={book} authorName={authors[book.book_id]} />
                            ))}
                        </div>
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
