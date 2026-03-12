import { dataPoint } from '@/lib/firebase/server';
import { Book } from '@/types/aozora';

export async function getRecentBooks(limit: number = 20, after?: string): Promise<Book[]> {
    try {
        const booksRef = dataPoint<Book>('books');
        let q = booksRef.orderBy('release_date', 'desc').limit(limit);
        if (after) {
            q = q.startAfter(after);
        }
        const snapshot = await q.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            book_id: doc.id,
        }));
    } catch (error) {
        console.error("Error fetching recent books:", error);
        return [];
    }
}

export async function getBook(bookId: string): Promise<Book | null> {
    try {
        const docRef = dataPoint<Book>('books').doc(bookId);
        const snapshot = await docRef.get();
        if (!snapshot.exists) {
            return null;
        }
        return {
            ...snapshot.data()!,
            book_id: snapshot.id
        };
    } catch (error) {
        console.error(`Error fetching book ${bookId}:`, error);
        return null;
    }
}

