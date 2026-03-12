import { algoliasearch } from 'algoliasearch';

let client: ReturnType<typeof algoliasearch> | null = null;

export function getAlgoliaClient() {
  if (!client) {
    client = algoliasearch(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_SEARCH_KEY!);
  }
  return client;
}
