import { getAlgoliaClient } from './client';
import { EnrichedBook, SearchResult } from '@/app/actions';
import { Person } from '@/types/aozora';

export async function unifiedSearch(query: string): Promise<SearchResult> {
  const { results } = await getAlgoliaClient().search({
    requests: [
      { indexName: 'books',   query, hitsPerPage: 10 },
      { indexName: 'persons', query, hitsPerPage: 10 },
    ],
  });

  const books   = (results[0] as unknown as { hits: EnrichedBook[] }).hits;
  const persons = (results[1] as unknown as { hits: Person[] }).hits;

  return { books, persons };
}

export async function searchBooks(query: string, limit: number = 20): Promise<EnrichedBook[]> {
  const { results } = await getAlgoliaClient().search({
    requests: [{ indexName: 'books', query, hitsPerPage: limit }],
  });
  return (results[0] as unknown as { hits: EnrichedBook[] }).hits;
}

export async function searchPersons(query: string, limit: number = 20): Promise<Person[]> {
  const { results } = await getAlgoliaClient().search({
    requests: [{ indexName: 'persons', query, hitsPerPage: limit }],
  });
  return (results[0] as unknown as { hits: Person[] }).hits;
}
