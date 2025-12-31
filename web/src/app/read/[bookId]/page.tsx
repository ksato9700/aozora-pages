import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getBook } from '@/lib/firestore/books';
import { fetchTextContent } from '@/lib/viewer';
import styles from './page.module.css';

interface Props {
    params: Promise<{ bookId: string }>;
    searchParams: Promise<{ format?: string }>;
}

export default async function ReaderPage({ params, searchParams }: Props) {
    const { bookId } = await params;
    const { format } = await searchParams;
    const mode = format === 'html' ? 'html' : 'text';

    const book = await getBook(bookId);

    if (!book) {
        notFound();
    }

    let content = '';
    if (mode === 'text' && book.text_url) {
        try {
            content = await fetchTextContent(book.text_url);
        } catch (e) {
            console.error("Failed to load text content", e);
            content = "Error loading content. Please try HTML mode or check the source.";
        }
    }

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className="flex items-center gap-4">
                    <Link href={`/books/${bookId}`} className={styles.backLink}>
                        ← Back to Details
                    </Link>
                    <h1 className={styles.title}>{book.title}</h1>
                </div>
                <div className="text-sm text-muted">
                    {mode === 'text' ? 'Text Mode' : 'HTML Mode'}
                </div>
            </header>

            {mode === 'text' ? (
                <div className={styles.viewerContainer}>
                    <div className={styles.verticalText}>
                        {content}
                    </div>
                </div>
            ) : (
                <div className={styles.iframeContainer}>
                    {book.html_url ? (
                        <iframe src={book.html_url} className={styles.iframe} title={book.title} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted">
                            HTML version not available.
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
