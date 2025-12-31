import Link from 'next/link';
import { Book } from '@/types/aozora';
import styles from './BookCard.module.css';

interface BookCardProps {
    book: Book;
    authorName?: string;
}

export default function BookCard({ book, authorName }: BookCardProps) {
    const title = book.title;
    const subtitle = book.subtitle;
    const date = book.release_date;

    return (
        <div className={styles.card}>
            <div className={styles.glassPanel}>
                <div className={styles.gradientOverlay} />

                <div className={styles.content}>
                    <Link href={`/books/${book.book_id}`} className="flex-1">
                        <h3 className={styles.title}>
                            {title}
                        </h3>
                        {subtitle && (
                            <p className={styles.subtitle}>{subtitle}</p>
                        )}
                        <div className="mt-2 text-sm text-gray-300">
                            {authorName && <div className="font-medium">{authorName}</div>}
                            <div className="text-xs text-gray-400 mt-1">
                                {date}
                            </div>
                        </div>
                    </Link>

                    <div className={styles.footer}>
                        <Link href={`/read/${book.book_id}?format=html`} className={styles.badge}>
                            今すぐ読む
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
