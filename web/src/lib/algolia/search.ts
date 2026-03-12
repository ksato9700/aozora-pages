import { getAlgoliaClient } from './client';
import { EnrichedBook, SearchResult } from '@/app/actions';
import { Person } from '@/types/aozora';
import { SearchResponse } from 'algoliasearch';

export async function unifiedSearch(query: string): Promise<SearchResult> {
  const { results } = await getAlgoliaClient().search<EnrichedBook | Person>({
    requests: [
      { indexName: 'books',   query, hitsPerPage: 10 },
      { indexName: 'persons', query, hitsPerPage: 10 },
    ],
  });

  if (!results || results.length < 2) {
    return { books: [], persons: [] };
  }

  const booksResponse = results[0] as SearchResponse<EnrichedBook>;
  const personsResponse = results[1] as SearchResponse<Person>;

  return {
    books: booksResponse.hits || [],
    persons: personsResponse.hits || [],
  };
}

export async function searchBooks(query: string, limit: number = 20): Promise<EnrichedBook[]> {
  const { results } = await getAlgoliaClient().search<EnrichedBook>({
    requests: [{ indexName: 'books', query, hitsPerPage: limit }],
  });
  
  if (!results || results.length === 0) return [];
  const response = results[0] as SearchResponse<EnrichedBook>;
  return response.hits || [];
}

export async function searchPersons(query: string, limit: number = 20): Promise<Person[]> {
  const { results } = await getAlgoliaClient().search<Person>({
    requests: [{ indexName: 'persons', query, hitsPerPage: limit }],
  });

  if (!results || results.length === 0) return [];
  const response = results[0] as SearchResponse<Person>;
  return response.hits || [];
}
