# Aozora Pages — Project Overview

Aozora Pages is a modern web reader for [Aozora Bunko (青空文庫)](https://www.aozora.gr.jp/), Japan's public-domain digital library. It re-publishes the catalogue with a polished UI, full-text search, author profiles, and an in-browser reader.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript 5 |
| Database | Google Cloud Firestore (via `firebase-admin`) |
| Hosting | Google Cloud Run (containerised) |
| Text storage | Cloudflare R2 (UTF-8 converted `.txt` / `.zip`) |
| HTML mirror | `aozora.ksato9700.com` (UTF-8 HTML conversion) |
| Styling | CSS Modules + Tailwind CSS utility classes |
| Encoding | `iconv-lite` (Shift_JIS → UTF-8), `adm-zip` |

---

## Application Routes

| Route | Type | Description |
|---|---|---|
| `/` | Server Component | Home page — shows 6 most-recently added books and a search bar |
| `/books/new` | Server Component | Lists the 50 most-recently added books |
| `/books/[bookId]` | Server Component | Book detail — metadata, contributors, download link |
| `/persons/[personId]` | Server Component | Author profile — bio and works grouped by role |
| `/read/[bookId]` | Server Component | In-browser reader — text mode (vertical scroll) or HTML mode (iframe) |

All pages are rendered server-side and query Firestore directly.

---

## Key Features

### Search
`SearchSection.tsx` (Client Component) debounces user input and calls the `search()` Server Action (`app/actions.ts`). The action runs four parallel Firestore prefix-range queries (book title, title yomi, author last name, author last name yomi), deduplicates results, enriches books with author names, and returns a `SearchResult` object.

### Reader
`/read/[bookId]` supports two modes selected via `?format=` query param:

- **Text mode** (default): fetches the `.txt` or `.zip` file from Cloudflare R2 server-side via `lib/viewer.ts`, decodes Shift_JIS, and renders the content vertically.
- **HTML mode**: embeds an `<iframe>` pointing to `aozora.ksato9700.com` (UTF-8 HTML mirror).

### Content Delivery Fallback
For books without copyright restrictions (`book.copyright === false`), the app falls back to the `aozora.ksato9700.com` mirror for both the HTML reader and the text download link.

---

## Directory Structure

```
aozora-pages/
├── web/                        # Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                  # [Server] Home page
│   │   │   ├── layout.tsx                # [Server] Root layout
│   │   │   ├── actions.ts                # [Server Action] search()
│   │   │   ├── books/
│   │   │   │   ├── new/page.tsx          # [Server] New books list
│   │   │   │   └── [bookId]/page.tsx     # [Server] Book detail
│   │   │   ├── persons/
│   │   │   │   └── [personId]/page.tsx   # [Server] Person detail
│   │   │   └── read/
│   │   │       └── [bookId]/page.tsx     # [Server] In-browser reader
│   │   ├── components/
│   │   │   ├── BookCard.tsx              # [Server] Book thumbnail card
│   │   │   ├── PersonCard.tsx            # [Server] Author card
│   │   │   ├── SearchSection.tsx         # [Client] Live search UI
│   │   │   └── SearchInput.tsx           # [Client] URL-param search input
│   │   ├── lib/
│   │   │   ├── firebase/server.ts        # Firestore Admin SDK init + dataPoint helper
│   │   │   ├── firestore/
│   │   │   │   ├── books.ts              # getBook(), getRecentBooks()
│   │   │   │   ├── persons.ts            # getPerson()
│   │   │   │   └── contributors.ts       # getContributorsForBook(), getWorksByPerson()
│   │   │   └── viewer.ts                 # fetchTextContent() — Shift_JIS / zip decode
│   │   └── types/
│   │       └── aozora.ts                 # Book, Person, Contributor types; ROLES map
│   ├── Dockerfile
│   └── next.config.ts
├── docs/
│   ├── OVERVIEW.md             # This document
│   ├── ARCHITECTURE.md         # Component architecture & Mermaid diagrams
│   └── DATA_FORMAT.md          # Firestore schema reference
├── cloudbuild.yaml             # Google Cloud Build CI/CD
└── Makefile
```

---

## Data Model (Firestore)

Three main collections mirror the Aozora Bunko CSV catalogue (imported by the separate `py-aozora-data` tool):

- **`books`** — keyed by `book_id`; holds title, URLs, metadata.
- **`persons`** — keyed by `person_id`; holds author name, dates.
- **`contributors`** — keyed by `{book_id}-{person_id}-{role_id}`; links books to persons with roles (著者/翻訳者/編者/校訂者/その他).

See [DATA_FORMAT.md](./DATA_FORMAT.md) for full field reference.

---

## Deployment

The app is containerised with Docker and deployed to **Google Cloud Run** via **Cloud Build** (`cloudbuild.yaml`). Cloud Run provides automatic scaling to zero and handles HTTPS termination. Firestore credentials are injected at runtime via the service account attached to the Cloud Run service.

For local development, see [web/README.md](../web/README.md).
