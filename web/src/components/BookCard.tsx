import Link from 'next/link';
import { Book } from '@/types/aozora';
import styles from './BookCard.module.css';

interface BookCardProps {
    book: Book;
}

export default function BookCard({ book }: BookCardProps) {
    const title = book.title;
    const subtitle = book.subtitle;

    return (
        <Link href={`/books/${book.book_id}`} className={styles.card}>
            <div className={styles.glassPanel}>
                <div className={styles.gradientOverlay} />

                <div className={styles.content}>
                    <h3 className={styles.title}>
                        {title}
                    </h3>
                    {subtitle && (
                        <p className={styles.subtitle}>{subtitle}</p>
                    )}

                    <div className={styles.footer}>
                        <div className={styles.id}>
                            ID: {book.book_id}
                        </div>
                        <span className={styles.badge}>
                            Read Now
                        </span>
                    </div>
                </div>
            </div>
        </Link>
    );
}
