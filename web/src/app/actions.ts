'use server'

import { headers } from 'next/headers';
import { Book, Person } from '@/types/aozora';
import { unifiedSearch } from '@/lib/algolia/search';

export type EnrichedBook = Book & { authorName?: string };

export type SearchResult = {
    books: EnrichedBook[];
    persons: Person[];
};

// Simple In-memory Cache & Rate Limiter
// Note: In a multi-instance production environment, Redis or a similar 
// distributed store would be preferred over this local in-memory approach.
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const searchCache = new Map<string, { result: SearchResult; timestamp: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

export async function search(query: string): Promise<SearchResult> {
    if (!query || query.trim().length < 2) {
        return { books: [], persons: [] };
    }

    const trimmedQuery = query.trim().toLowerCase();

    // 1. Rate Limiting
    const headerList = await headers();
    const ip = headerList.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    const clientRateLimit = rateLimitMap.get(ip);
    if (!clientRateLimit || (now - clientRateLimit.windowStart) > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { count: 1, windowStart: now });
    } else {
        if (clientRateLimit.count >= MAX_REQUESTS_PER_WINDOW) {
            console.warn(`Rate limit exceeded for IP: ${ip}`);
            // Return empty results or throw an error. For UX, we'll return empty.
            return { books: [], persons: [] };
        }
        clientRateLimit.count++;
    }

    // 2. Caching
    const cached = searchCache.get(trimmedQuery);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
        return cached.result;
    }

    try {
        const result = await unifiedSearch(trimmedQuery);
        
        // Update cache
        searchCache.set(trimmedQuery, { result, timestamp: now });
        
        // Optional: Cleanup old cache entries periodically
        if (searchCache.size > 1000) {
            const firstKey = searchCache.keys().next().value;
            if (firstKey) searchCache.delete(firstKey);
        }

        return result;
    } catch (error) {
        console.error("Search error:", error);
        return { books: [], persons: [] };
    }
}
