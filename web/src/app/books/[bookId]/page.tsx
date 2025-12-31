import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBook } from '@/lib/firestore/books';
import { getContributorsForBook } from '@/lib/firestore/contributors';
import { ROLES } from '@/types/aozora';
import PersonCard from '@/components/PersonCard';
import styles from './page.module.css';

interface Props {
    params: Promise<{ bookId: string }>
}

export default async function BookDetailPage({ params }: Props) {
    const { bookId } = await params;

    const [book, contributors] = await Promise.all([
        getBook(bookId),
        getContributorsForBook(bookId)
    ]);

    if (!book) {
        notFound();
    }

    return (
        <main className={styles.main}>
            <div className="container">
                <header className={styles.hero}>
                    <h1 className={styles.title}>{book.title}</h1>
                    {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}

                    <div className={styles.actions}>
                        {/* Links to internal viewer - To be implemented */}
                        {book.text_url && (
                            <Link href={`/read/${bookId}?format=html`} className={`${styles.button} ${styles.primaryButton}`}>
                                今すぐ読む
                            </Link>
                        )}
                        <a href={book.card_url} target="_blank" rel="noopener noreferrer" className={`${styles.button} ${styles.secondaryButton}`}>
                            青空文庫カード
                        </a>
                    </div>

                    <div className={styles.metaGrid}>
                        <div className={styles.metaItem}>
                            <label>NDC分類</label>
                            <span>{book.ndc_code || 'N/A'}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <label>公開日</label>
                            <span>{book.release_date}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <label>原題</label>
                            <span>{book.original_title || '-'}</span>
                        </div>
                        <div className={styles.metaItem}>
                            <label>著作権</label>
                            <span>{book.copyright ? 'あり' : 'なし'}</span>
                        </div>
                    </div>
                </header>

                <section>
                    <h2 className={styles.sectionTitle}>関係者</h2>
                    {contributors.length > 0 ? (
                        <div className={styles.grid}>
                            {contributors.map((c) => (
                                <div key={`${c.person.person_id}-${c.role}`}>
                                    <div className="mb-2 text-sm text-accent font-bold uppercase tracking-wider">
                                        {ROLES[c.role] || 'Contributor'}
                                    </div>
                                    <PersonCard person={c.person} />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted">関係者の記録はありません。</p>
                    )}
                </section>
            </div>
        </main>
    );
}
