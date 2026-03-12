import { algoliasearch } from 'algoliasearch';

export const algolia = algoliasearch(
  process.env.ALGOLIA_APP_ID!,
  process.env.ALGOLIA_SEARCH_KEY!,
);
