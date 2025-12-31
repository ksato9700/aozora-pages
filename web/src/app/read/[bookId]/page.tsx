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
            content = "読み込みエラー。HTMLモードを試すか、情報源を確認してください。";
        }
    }

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className="flex items-center gap-4">
                    <Link href={`/books/${bookId}`} className={styles.backLink}>
                        ← 詳細に戻る
                    </Link>
                    <h1 className={styles.title}>{book.title}</h1>
                </div>
                <div className="text-sm text-muted">
                    {mode === 'text' ? 'テキストモード' : 'HTMLモード'}
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
                            HTML版は利用できません。
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}
