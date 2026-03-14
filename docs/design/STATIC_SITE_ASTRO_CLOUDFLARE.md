# Design: Static Site Migration — Astro 6.0 on Cloudflare

**Status:** Implemented (merged 2026-03-15)
**Date:** 2026-03-13
**Context:** Replace the current Next.js / Cloud Run / Firestore stack with a static site built by Astro 6.0, generated inside the existing `py-aozora-data` import container, and deployed to Cloudflare Pages.

---

## 1. Goals

- **Eliminate the runtime server** (Cloud Run) and its associated costs
- **Eliminate Firestore** — the database was only needed because two independent processes (importer and server) shared data; once everything runs in one pipeline, no database is required
- **Reduce operational complexity** — no container runtime to scale, no GCP database to maintain
- **Improve global performance** by serving pre-rendered HTML from Cloudflare's edge CDN
- **Consolidate on Cloudflare** infrastructure (R2 already in use)

---

## 2. Core Insight

The Aozora Bunko catalogue is published as a CSV file. The `py-aozora-data` importer already parses that CSV into the exact data structures the site needs. Instead of writing to Firestore and having a server re-read it on every user request, the importer can write JSON files directly, then run `astro build` to bake everything into static HTML in one continuous pipeline.

```
Before:
  CSV → py-aozora-data → Firestore ← Next.js (per request) → User

After:
  CSV → py-aozora-data → JSON files → astro build → HTML → Cloudflare Pages → User
```

Firestore's only role was bridging two independent processes. Remove that bridge and the database disappears.

---

## 3. Feasibility

### 3.1 Why SSG works for this content

| Characteristic | Value |
|---|---|
| Total books | ~17,800 |
| Total persons | ~1,300 |
| Total pages pre-rendered | ~19,200 (read pages are SPA, not pre-rendered) |
| Update frequency | Once per day |
| User personalisation | None |
| Authentication | None |
| Transactional writes | None |

### 3.2 Dynamic concerns and solutions

| Current dynamic behaviour | Solution |
|---|---|
| Latest books list | Pre-render at build time; rebuild daily |
| Home page (`force-dynamic`) | Pre-render at build time; rebuild daily |
| Cursor-based pagination | Pre-render offset-based pages at build time |
| Server-side Algolia search | Client-side Algolia (search-only key is safe to expose) |
| Rate limiting on search | Cloudflare WAF rate-limiting rule |
| Text fetch + Shift_JIS decode | Cloudflare Pages Function (`functions/api/read.ts`) |
| ZIP extraction | `fflate` (pure JS, works in Pages Functions) |

### 3.3 Incremental import vs full rebuild

The Astro build always regenerates all ~36,900 pages regardless of how many books changed — there is no per-page incremental mode. However, incremental processing at the **Algolia indexing** step still matters:

- Re-indexing all 17,800 books and 1,300 persons on every daily run wastes Algolia indexing operations (and costs)
- The `last_modified` watermark is kept to send only changed records to Algolia
- For JSON file generation and the Astro build, the full dataset is always written and rebuilt

The watermark now lives in **Cloudflare R2** (a small `watermark.json` object in the existing bucket) rather than Firestore.

---

## 4. Architecture

### 4.1 Pipeline overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  py-aozora-data container  (Python 3.13 + Node.js LTS)              │
│                                                                      │
│  1. Python: download CSV from aozora.gr.jp                          │
│  2. Python: read watermark.json from R2                             │
│  3. Python: parse CSV rows (skip unchanged via watermark)           │
│  4. Python: write books.json / persons.json / contributors.json     │
│  5. Python: update Algolia indices (changed records only)           │
│  6. Python: write new watermark.json to R2                          │
│  7. Node.js: astro build  (reads JSON files → ~36,900 HTML files)   │
│  8. Node.js: wrangler pages deploy dist/                            │
└─────────────────────────────────────────────────────────────────────┘

Runtime (no server, no database)
──────────────────────────────────────────────────────────────────────
  User ──► Cloudflare Pages CDN ──► pre-rendered HTML

  /api/read?src=...  ──► Cloudflare Pages Function
                           fetch R2 text → TextDecoder(shift_jis) → UTF-8

External services (unchanged)
  Algolia — client-side full-text search
  Cloudflare R2 — text files + watermark.json
  aozora.ksato9700.com — HTML mirror (iframe)
```

### 4.2 Component mapping

| Current | New |
|---|---|
| Firestore | JSON files (ephemeral in container, no persistence needed) |
| Next.js Server Components | Astro `.astro` page templates |
| Next.js Server Actions | Client-side Algolia Island |
| `firebase-admin` SDK | Removed from both repos |
| `google-cloud-firestore` (Python) | Removed |
| `google-auth` (Python) | Removed |
| `AozoraFirestore` class | `AozoraJSON` class (same interface) |
| Watermark in Firestore | `watermark.json` in R2 (via boto3) |
| Cloud Run (Next.js server) | Cloudflare Pages (static) |
| Cloud Build (Docker deploy) | Cloud Build (container job + Pages deploy) |
| Secret Manager (Firestore creds) | Secret Manager (Cloudflare API token only) |

---

## 5. JSON File Format

Three files written to `/data/` inside the container:

**`books.json`** — array of all book objects:
```json
[
  {
    "book_id": "000001",
    "title": "...",
    "title_yomi": "...",
    "copyright": false,
    "release_date": "2022-01-01",
    "text_url": "https://...",
    "author_name": "夏目 漱石",
    "author_id": 148,
    ...
  }
]
```

**`persons.json`** — array of all person objects with `person_id` as string.

**`contributors.json`** — array of all contributor objects with `book_id` and `person_id` as integers (matching the existing type definitions).

**`watermark.json`** (stored in R2, not in container):
```json
{ "last_modified": "2026-03-12" }
```

---

## 6. Technology

### 6.1 Astro 6.0 (`astro/`)

- `output: 'static'` with no server adapter — `astro build` runs in plain Node.js
- `@astrojs/react` for client Islands (search dropdown, text reader)
- `src/lib/data.ts` reads JSON files and builds in-memory Maps for page generation
- `functions/api/read.ts` — Cloudflare Pages Function for the text reader (uses `fflate` + `TextDecoder('shift_jis')`)

### 6.2 Algolia (unchanged, moved client-side)

The `PUBLIC_ALGOLIA_SEARCH_KEY` (Search-Only key) is safe to expose. Search moves from a Next.js Server Action to a client-side React Island calling Algolia directly.

### 6.3 Watermark persistence (R2 via boto3)

The only state that needs to survive between container runs is the `last_modified` watermark. Stored as `watermark.json` in the existing R2 bucket:

```python
# read at start of import
s3 = boto3.client('s3', ...)
obj = s3.get_object(Bucket=bucket, Key='watermark.json')
watermark = json.load(obj['Body'])['last_modified']

# write at end of import
s3.put_object(Bucket=bucket, Key='watermark.json',
              Body=json.dumps({'last_modified': date_str}))
```

`boto3` was previously removed as unused; it is re-added here as a justified dependency.

---

## 7. Implementation

### 7.1 `py-aozora-data` changes

**New file: `aozora_data/db/json_backend.py`**

Implements the same interface as `AozoraFirestore` so `csv_importer.py` requires no changes:

```python
class AozoraJSON:
    def get_watermark(self) -> str | None: ...      # reads from R2
    def save_watermark(self, date_str: str): ...    # writes to R2
    def upsert_book(self, book_id, data): ...       # accumulates in memory
    def upsert_person(self, person_id, data): ...   # accumulates in memory
    def upsert_contributor(self, cid, data): ...    # accumulates in memory
    def update_book_author(self, book_id, data): ...# updates in-memory book
    def commit(self): ...                           # no-op (data stays in memory)
    def flush(self, output_dir: Path): ...          # writes the three JSON files
```

**Updated: `aozora_data/importer/main.py`**

Instantiates `AozoraJSON` instead of `AozoraFirestore`, calls `db.flush()` after import.

**Updated: `pyproject.toml`**

Remove `google-cloud-firestore`, `google-auth`. Add `boto3`.

**Updated: `Dockerfile`**

Add Node.js LTS, install `wrangler`, copy `astro/` source, run `astro build` and `wrangler pages deploy` as final steps.

### 7.2 `astro/` changes

**Updated: `src/lib/data.ts`**

Read from JSON files instead of Firestore:

```typescript
import booksData from '../../data/books.json';
import personsData from '../../data/persons.json';
import contributorsData from '../../data/contributors.json';
```

**Deleted: `src/lib/firebase.ts`**

**Updated: `package.json`**

Remove `firebase-admin`.

---

## 8. Build & Deployment Pipeline

### 8.1 Container execution order

```
1. Python: requests.get(CSV_URL) → parse in memory
2. Python: boto3 → get watermark.json from R2
3. Python: filter CSV rows by last_modified > watermark
4. Python: accumulate books/persons/contributors in AozoraJSON
5. Python: call Algolia API for changed records
6. Python: AozoraJSON.flush('/data')  →  writes 3 JSON files
7. Python: boto3 → put watermark.json to R2
8. Node.js: cd /astro && npm ci
9. Node.js: astro build  (reads /data/*.json, generates /astro/dist/)
10. Node.js: wrangler pages deploy /astro/dist/ --project-name=aozora-pages
```

### 8.2 Expected durations

| Step | Estimated time |
|---|---|
| CSV download + parse | 10–20 s |
| Algolia incremental update | 5–10 s |
| JSON file write (~38K records) | 2–5 s |
| `npm ci` (cached layers) | 10–20 s |
| `astro build` (~19,200 pages) | 60–90 s |
| `wrangler pages deploy` | 30–60 s |
| **Total** | **~3–4 min** |

### 8.3 Environment variables

| Variable | Used by | Source |
|---|---|---|
| `AOZORA_CSV_URL` | Python | Cloud Build / hardcoded default |
| `R2_ACCOUNT_ID` | Python (boto3) | Secret Manager |
| `R2_ACCESS_KEY_ID` | Python (boto3) | Secret Manager |
| `R2_SECRET_ACCESS_KEY` | Python (boto3) | Secret Manager |
| `R2_BUCKET_NAME` | Python (boto3) | Cloud Build env |
| `ALGOLIA_APP_ID` | Python + Astro | Secret Manager |
| `ALGOLIA_ADMIN_KEY` | Python | Secret Manager |
| `PUBLIC_ALGOLIA_SEARCH_KEY` | Astro (client) | Secret Manager |
| `CLOUDFLARE_API_TOKEN` | wrangler | Secret Manager |
| `CLOUDFLARE_ACCOUNT_ID` | wrangler | Cloud Build env |

---

## 9. Challenges and Mitigations

### 9.1 Build time

**Risk**: 3–4 minute container run delays daily content updates.

**Mitigation**: Acceptable for a daily import. If speed matters, the Node.js steps (astro build + deploy) could run in a separate Cloud Build step in parallel with other work, or cache `node_modules` as a Docker layer.

### 9.2 Container size (two runtimes)

**Risk**: Python + Node.js container is larger than either alone.

**Mitigation**: Use multi-stage build — Python stage for import, Node.js stage for Astro build. Final image keeps only what's needed for the final command. Alternatively, run as two sequential Cloud Build steps sharing an artifact via GCS.

### 9.3 Watermark loss

**Risk**: If R2 is unavailable or the watermark object is deleted, the importer processes all ~17,800 books and sends them all to Algolia.

**Mitigation**: Graceful fallback — `get_watermark()` returns `None` on any error, which causes a full re-index. This is slow but correct. Algolia's `saveObjects` is idempotent, so a full re-index produces no errors.

### 9.4 Algolia search key exposed to client

**Risk**: `PUBLIC_ALGOLIA_SEARCH_KEY` is visible in browser source.

**Mitigation**: This is the intended use of the Search-Only key. Restrict it to the production domain in the Algolia dashboard.

### 9.5 Pagination for `/books/new`

Pre-render offset-based pages (`/books/new`, `/books/new/2`, …). Currently generates 21 pages of 24 books covering the 500 most recent books — enough for "new arrivals" browsing.

---

## 10. What Is Dropped

| Component | Why | Impact |
|---|---|---|
| **Firestore** | No longer needed as intermediary | None for users |
| `google-cloud-firestore` (Python) | No Firestore | Smaller Python deps |
| `google-auth` (Python) | No GCP SDK needed | Smaller Python deps |
| `firebase-admin` (Node.js) | No Firestore | Smaller npm deps |
| `AozoraFirestore` class | Replaced by `AozoraJSON` | None |
| `import_state` Firestore doc | Replaced by R2 watermark.json | None |
| Cloud Run (Next.js server) | No runtime server | None for users |
| Artifact Registry (Docker images for Next.js) | Not needed | Simpler CI |
| Next.js Server Actions | Client-side Algolia | None for users |
| In-process rate limiter | Cloudflare WAF | None for users |

**Kept:**
- Cloud Build (repurposed to run the integrated container job)
- Secret Manager (for R2 credentials, Algolia keys, Cloudflare API token)
- Cloudflare R2 (text files + watermark)
- Algolia (indices + admin key for Python, search key for browser)

---

## 11. Migration Steps

1. **`py-aozora-data`**: Implement `AozoraJSON`, update `main.py`, update `pyproject.toml`, update `Dockerfile`
2. **`astro/`**: Update `src/lib/data.ts` to read JSON files, delete `src/lib/firebase.ts`, remove `firebase-admin` from `package.json`
3. **Cloudflare**: Create Pages project, generate `CLOUDFLARE_API_TOKEN`
4. **Secret Manager**: Add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; remove Firestore-related secrets
5. **End-to-end test**: Run container locally, verify JSON files, verify `astro build`, verify Pages deploy
6. **DNS cutover**: Point domain to Cloudflare Pages
7. **Decommission**: Cloud Run service, Firestore database, Next.js image in Artifact Registry

---

## 12. Cost Comparison

| Line item | Current | New |
|---|---|---|
| Runtime server | Cloud Run (~$0 at low traffic) | Cloudflare Pages — free |
| Database | Firestore (~$0–2/month) | **None** |
| CI/CD | Cloud Build (repurposed) | Cloud Build (same) |
| Secrets | Secret Manager (same) | Secret Manager (fewer secrets) |
| Algolia | Unchanged | Unchanged |
| R2 | Unchanged + `watermark.json` | Unchanged (watermark is negligible) |

Net: Firestore eliminated. Cloud Run eliminated. GCP footprint reduced to Cloud Build + Secret Manager only.
