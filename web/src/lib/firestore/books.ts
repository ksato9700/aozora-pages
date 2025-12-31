import { db, dataPoint } from '@/lib/firebase/server';
import { Book } from '@/types/aozora';

export async function getRecentBooks(limit: number = 20): Promise<Book[]> {
    try {
        const booksRef = dataPoint<Book>('books');
        const q = booksRef.orderBy('release_date', 'desc').limit(limit);
        const snapshot = await q.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            book_id: doc.id, // Ensure ID is included
        }));
    } catch (error) {
        console.error("Error fetching recent books:", error);
        // Return empty array or throw, depending on error handling strategy.
        // For now, return empty to not crash the page.
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

export async function searchBooks(query: string, limit: number = 20): Promise<Book[]> {
    try {
        const booksRef = dataPoint<Book>('books');
        // Prefix search on title
        const q = booksRef
            .where('title', '>=', query)
            .where('title', '<', query + '\uf8ff')
            .orderBy('title')
            .limit(limit);

        const snapshot = await q.get();

        return snapshot.docs.map(doc => ({
            ...doc.data(),
            book_id: doc.id,
        }));
    } catch (error) {
        console.error("Error searching books:", error);
        return [];
    }
}
