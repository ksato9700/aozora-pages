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
                    <div className="mb-2 text-sm text-gray-500">{book.title_yomi}</div>
                    <h1 className={styles.title}>{book.title}</h1>
                    {book.subtitle && (
                        <div className="mb-4">
                            <div className="text-xs text-gray-400">{book.subtitle_yomi}</div>
                            <p className={styles.subtitle}>{book.subtitle}</p>
                        </div>
                    )}

                    <div className={styles.actions}>
                        {/* Links to internal viewer - To be implemented */}
                        {book.text_url && (
                            <>
                                <Link href={`/read/${bookId}?format=html`} className={`${styles.button} ${styles.primaryButton}`}>
                                    今すぐ読む
                                </Link>
                                <a href={`https://aozora.ksato9700.com/${bookId.padStart(6, '0')}.utf8.txt`} className={`${styles.button} ${styles.secondaryButton}`} target="_blank" rel="noopener noreferrer">
                                    テキストファイルをダウンロード
                                </a>
                            </>
                        )}

                    </div>


                </header>

                <div className="space-y-12 mb-16">
                    {/* Work Data */}
                    <div className="mb-6">
                        <h2 className={styles.sectionTitle}>作品</h2>
                        <table className="w-full text-sm text-left">
                            <tbody>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">公開日</th>
                                    <td className="">{book.release_date || '-'}</td>
                                </tr>

                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">文字遣い種別</th>
                                    <td className="">{book.font_kana_type || '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Authors Data (Formerly Contributors) */}
                    <div className="mb-6">
                        <h2 className={styles.sectionTitle}>作家</h2>
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
                            <p className="text-muted">作家の記録はありません。</p>
                        )}
                    </div>

                    {/* Base Book Data */}
                    <div className="mb-6">
                        <h2 className={styles.sectionTitle}>底本</h2>
                        <table className="w-full text-sm text-left">
                            <tbody>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">底本</th>
                                    <td className="">{book.base_book_1 || '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">出版社</th>
                                    <td className="">{book.base_book_1_publisher || '-'}</td>
                                </tr>

                            </tbody>
                        </table>
                    </div>

                    {/* Worker Data */}
                    <div>
                        <h2 className={styles.sectionTitle}>工作員</h2>
                        <table className="w-full text-sm text-left">
                            <tbody>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">入力者</th>
                                    <td className="">{book.input || '-'}</td>
                                </tr>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left font-bold text-red-800 w-32">校正者</th>
                                    <td className="">{book.proofing || '-'}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>


            </div>
        </main>
    );
}
