import { getRecentBooks } from '@/lib/firestore/books';
import BookCard from '@/components/BookCard';
import styles from './page.module.css';

import { getContributorsForBook } from '@/lib/firestore/contributors';

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
  const recentBooks = await getRecentBooks(20);

  // Fetch authors for all books
  const authors: Record<string, string> = {};
  await Promise.all(recentBooks.map(async (book) => {
    const contributors = await getContributorsForBook(book.book_id);
    // Find author (role 0) or fallback to first contributor
    const author = contributors.find(c => c.role === 0) || contributors[0];
    if (author) {
      authors[book.book_id] = `${author.person.last_name} ${author.person.first_name}`;
    }
  }));

  return (
    <main className={styles.main}>
      <div className="container">
        <header className={styles.header}>
          <h1 className={styles.title}>
            <span className="text-gradient">Aozora Pages</span>
          </h1>
          <p className={styles.subtitle}>
            不朽の名作を、美しいレイアウトで。
          </p>
        </header>

        <section>
          <h2 className={styles.sectionTitle}>新着図書</h2>

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
