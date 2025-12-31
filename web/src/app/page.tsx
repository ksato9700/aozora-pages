import { getRecentBooks } from '@/lib/firestore/books';
import BookCard from '@/components/BookCard';
import styles from './page.module.css';

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
  const recentBooks = await getRecentBooks(20);

  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.header}>
          <h1 className={styles.title}>
            <span className="text-gradient">Aozora Pages</span>
          </h1>
          <p className={styles.subtitle}>
            Discover timeless Japanese literature, beautifully presented.
          </p>
        </header>

        <section>
          <h2 className={styles.sectionTitle}>Recently Added</h2>

          {recentBooks.length > 0 ? (
            <div className={styles.grid}>
              {recentBooks.map((book) => (
                <BookCard key={book.book_id} book={book} />
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
