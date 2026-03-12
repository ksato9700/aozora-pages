'use server'

import { dataPoint } from '@/lib/firebase/server';
import { Book, Person } from '@/types/aozora';

export type EnrichedBook = Book & { authorName?: string };

export type SearchResult = {
    books: EnrichedBook[];
    persons: Person[];
};

export async function search(query: string): Promise<SearchResult> {
    if (!query || query.length < 2) {
        return { books: [], persons: [] };
    }

    try {
        const booksRef = dataPoint<Book>('books');
        const personsRef = dataPoint<Person>('persons');

        // Parallel queries
        // Note: Firestore prefix search limitation: query >= str && query < str + \uf8ff
        const bookTitleQuery = booksRef.where('title', '>=', query).where('title', '<', query + '\uf8ff').limit(10).get();
        const bookYomiQuery = booksRef.where('title_yomi', '>=', query).where('title_yomi', '<', query + '\uf8ff').limit(10).get();

        const personNameQuery = personsRef.where('last_name', '>=', query).where('last_name', '<', query + '\uf8ff').limit(10).get();
        const personYomiQuery = personsRef.where('last_name_yomi', '>=', query).where('last_name_yomi', '<', query + '\uf8ff').limit(10).get();

        const [bTitle, bYomi, pName, pYomi] = await Promise.all([
            bookTitleQuery, bookYomiQuery, personNameQuery, personYomiQuery
        ]);

        // Deduplicate Books
        const bookMap = new Map<string, EnrichedBook>();
        bTitle.docs.forEach(doc => bookMap.set(doc.id, { ...doc.data(), book_id: doc.id }));
        bYomi.docs.forEach(doc => bookMap.set(doc.id, { ...doc.data(), book_id: doc.id }));

        // Deduplicate Persons
        const personMap = new Map<string, Person>();
        pName.docs.forEach(doc => personMap.set(doc.id, { ...doc.data(), person_id: doc.id }));
        pYomi.docs.forEach(doc => personMap.set(doc.id, { ...doc.data(), person_id: doc.id }));

        const books = Array.from(bookMap.values());
        const enrichedBooks = books.map(book => ({
            ...book,
            authorName: book.author_name,
        }));

        return {
            books: enrichedBooks,
            persons: Array.from(personMap.values())
        };

    } catch (error) {
        console.error("Search error:", error);
        return { books: [], persons: [] };
    }
}
