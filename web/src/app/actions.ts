'use server'

import { Book, Person } from '@/types/aozora';
import { unifiedSearch } from '@/lib/algolia/search';

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
        return await unifiedSearch(query);
    } catch (error) {
        console.error("Search error:", error);
        return { books: [], persons: [] };
    }
}
