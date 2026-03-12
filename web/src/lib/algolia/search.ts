import { algolia } from './client';
import { EnrichedBook, SearchResult } from '@/app/actions';
import { Person } from '@/types/aozora';

export async function unifiedSearch(query: string): Promise<SearchResult> {
  const { results } = await algolia.search({
    requests: [
      { indexName: 'books',   query, hitsPerPage: 10 },
      { indexName: 'persons', query, hitsPerPage: 10 },
    ],
  });

  const books   = (results[0] as { hits: EnrichedBook[] }).hits;
  const persons = (results[1] as { hits: Person[] }).hits;

  return { books, persons };
}
