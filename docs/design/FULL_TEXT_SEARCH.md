# Design: Full-Text Search (replacing prefix-only Firestore search)

## Problem

The current search uses Firestore range queries to simulate prefix matching:

```ts
// lib/firestore/books.ts
collectionRef.where('title', '>=', query).where('title', '<=', query + '\uf8ff')
```

This only matches strings that **start with** the query. A user searching for `吾輩`
will not find `吾輩は猫である` unless they type from the very first character.
Searching by a word in the middle of a title, or by first name rather than last name,
is impossible.

Additionally, the homepage search fires **4 parallel Firestore queries** per keystroke
(title, title_yomi, last_name, last_name_yomi), which adds Firestore read costs and
still returns poor results.

---

## Goals

- Support substring and full-text search across book titles and author names
- Support both kanji and yomi (phonetic) fields in a single query
- Reduce per-keystroke Firestore reads to zero for the autocomplete path
- Maintain response time under 200 ms for autocomplete
- Keep infrastructure cost at zero (test site)

---

## Options Considered

### A. Algolia (Build / free tier)
- 1,000,000 records — sufficient (Aozora has ~17,000 books, ~2,000 persons)
- **10,000 search requests/month** — sufficient for this test site (~1,000 req/mo actual)
- No self-hosting; zero infrastructure to manage
- Japanese language support built-in
- **Selected**

### B. Meilisearch (self-hosted on Cloud Run)
- Open source, full-text search with Japanese tokenizer support
- ~$7/month on Cloud Run with `min-instances: 1` and a persistent volume
- More operational overhead (deployment, volume management, indexing job)
- **Rejected** — unnecessary cost and complexity for a test site

### C. Typesense Cloud (free tier)
- Generous request allowance but unclear SLA and persistence guarantees on free tier
- **Rejected** — Algolia free tier is simpler and better documented

---

## Architecture

```
User keystroke
    │
    ▼
Next.js Server Action (actions.ts)
    │  single HTTPS query (Algolia Search API)
    ▼
Algolia (multi-index search: books + persons)
    │  returns ranked hits
    ▼
Autocomplete dropdown (SearchSection.tsx)


Data sync (triggered at deploy time via cloudbuild.yaml):
Firestore ──► indexing script (Python) ──► Algolia indices
```

No new Cloud Run services are required. The Next.js service calls Algolia directly.

---

## Algolia Index Design

### `books` index

| Field | Searchable | Retrievable | Notes |
|---|---|---|---|
| `book_id` | no | yes | objectID |
| `title` | yes (rank 1) | yes | |
| `title_yomi` | yes (rank 2) | yes | |
| `author_name` | yes (rank 3) | yes | denormalized |
| `author_name_yomi` | yes (rank 4) | no | if available |
| `author_id` | no | yes | for linking |
| `font_kana_type` | no | yes | badge in UI |
| `copyright` | no | yes | for URL logic |

```json
{
  "searchableAttributes": [
    "title",
    "title_yomi",
    "author_name",
    "author_name_yomi"
  ],
  "attributesToRetrieve": [
    "book_id", "title", "title_yomi", "author_name",
    "author_id", "font_kana_type", "copyright"
  ],
  "customRanking": ["desc(book_id)"],
  "ignorePlurals": false,
  "removeStopWords": false,
  "queryLanguages": ["ja"]
}
```

### `persons` index

| Field | Searchable | Retrievable | Notes |
|---|---|---|---|
| `person_id` | no | yes | objectID |
| `last_name` | yes (rank 1) | yes | |
| `first_name` | yes (rank 2) | yes | currently unsearchable |
| `last_name_yomi` | yes (rank 3) | yes | |
| `first_name_yomi` | yes (rank 4) | yes | |

```json
{
  "searchableAttributes": [
    "last_name", "first_name", "last_name_yomi", "first_name_yomi"
  ],
  "attributesToRetrieve": [
    "person_id", "last_name", "first_name", "last_name_yomi", "first_name_yomi"
  ],
  "queryLanguages": ["ja"]
}
```

---

## Code Changes

### New files

```
web/src/lib/algolia/
  client.ts   — initialise Algolia client from env vars
  search.ts   — unifiedSearch() using multi-index search
scripts/
  index_algolia.py  — reads Firestore, writes to Algolia indices
```

### Modified files

| File | Change |
|---|---|
| `web/src/app/actions.ts` | Replace 4 Firestore queries with single `unifiedSearch()` call |
| `web/src/lib/firestore/books.ts` | Keep `searchBooks()` for `/books` page (migrate later if needed) |
| `web/src/lib/firestore/persons.ts` | Keep `searchPersons()` for `/persons` page (migrate later if needed) |
| `cloudbuild.yaml` | Add step to run `index_algolia.py` after deploy |
| Cloud Run env vars | Add `ALGOLIA_APP_ID`, `ALGOLIA_SEARCH_KEY` (public), `ALGOLIA_ADMIN_KEY` (indexing only) |

### `lib/algolia/client.ts`

```ts
import { algoliasearch } from 'algoliasearch';

export const algolia = algoliasearch(
  process.env.ALGOLIA_APP_ID!,
  process.env.ALGOLIA_SEARCH_KEY!,
);
```

### `lib/algolia/search.ts`

```ts
import { algolia } from './client';

export async function unifiedSearch(query: string) {
  const { results } = await algolia.search({
    requests: [
      { indexName: 'books',   query, hitsPerPage: 10 },
      { indexName: 'persons', query, hitsPerPage: 10 },
    ],
  });

  return {
    books:   results[0].hits,
    persons: results[1].hits,
  };
}
```

### `app/actions.ts` (after change)

```ts
// Before: 4 parallel Firestore queries
// After:  single Algolia multi-index query

import { unifiedSearch } from '@/lib/algolia/search';

export async function search(query: string): Promise<SearchResult> {
  if (query.length < 2) return { books: [], persons: [] };
  return unifiedSearch(query);
}
```

---

## Indexing Script (`scripts/index_algolia.py`)

Reads all documents from Firestore `books` and `persons` collections and upserts
them into the corresponding Algolia indices. Uses `objectID` = `book_id` / `person_id`
so it is safe to re-run (idempotent).

Run at deploy time via `cloudbuild.yaml`:

```yaml
- name: 'python:3.13-slim'
  entrypoint: bash
  args:
    - '-c'
    - 'pip install -q algoliasearch google-cloud-firestore && python scripts/index_algolia.py'
  secretEnv: ['ALGOLIA_APP_ID', 'ALGOLIA_ADMIN_KEY']
```

---

## Cost

| Resource | Limit | Actual usage | Cost |
|---|---|---|---|
| Algolia Build (free) | 10,000 req/mo | ~1,000 req/mo | $0 |
| Algolia records | 1,000,000 | ~19,000 | $0 |
| **Total** | | | **$0/mo** |

---

## Migration Plan

1. Create Algolia application and two indices (`books`, `persons`) via Algolia dashboard
2. Run `index_algolia.py` locally to populate indices and verify results
3. Add `ALGOLIA_APP_ID` and `ALGOLIA_SEARCH_KEY` to Cloud Run env vars
4. Deploy Next.js with `actions.ts` switched to `unifiedSearch()`
5. Add `index_algolia.py` step to `cloudbuild.yaml` (with `ALGOLIA_ADMIN_KEY` secret) so indices stay in sync on each deploy

---

## Open Questions

- **Incremental sync**: The initial design re-indexes everything at deploy time. If books are added/updated in Firestore outside of a deploy, a scheduled Cloud Run Job (e.g. nightly) or Firestore trigger may be needed.
- **Search-only API key**: Use a restricted Algolia Search-Only API key in the Next.js server action (not the Admin key) to limit exposure if the key leaks.
