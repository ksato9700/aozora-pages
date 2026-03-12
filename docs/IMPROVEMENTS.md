# Improvement Suggestions

## 1. N+1 Query Problem (High Impact)

`getContributorsForBook` fires one `getPerson()` Firestore read per contributor, and every page that lists books (`/`, `/books/new`, search) calls it once per book. For a 50-book page this easily becomes 100–200 serial round-trips.

**Fix**: Denormalize the primary author's name directly into the `books` document (e.g. an `author_name` field). The importer already has the data; write it at import time. One read per book instead of N.

---

## 2. Search Only Does Prefix Matching

The Firestore range trick (`>= query`, `< query + \uf8ff`) only matches values that **start with** the query. Searching for "吾輩" will not find "吾輩は猫である" if the user types "猫". This is a fundamental limitation of Firestore.

**Fix options** (pick one):
- Sync the catalogue to **Algolia** or **Typesense** for real full-text search. Algolia has a generous free tier and good Japanese tokenization.
- Use **Firestore's built-in full-text search** (currently in preview) if staying on GCP.

---

## 3. Text Reader Renders Raw Aozora Markup

The text mode dumps the raw `.txt` content into a `<div>`. Aozora Bunko files contain annotation syntax that shows up as noise to readers:

| Syntax | Meaning |
|---|---|
| `《》` | Ruby (furigana) |
| `｜` | Ruby base marker |
| `［＃…］` | Formatting directives (chapter breaks, font size, image refs, etc.) |

**Fix**: Parse these annotations in `viewer.ts` on the server before sending content to the client. Convert `《》` pairs to HTML `<ruby>` elements and strip or honour `［＃…］` directives. Several open-source JS libraries implement this (following `aozora2html` patterns).

---

## 4. No Pagination on `/books/new`

The page hardcodes `getRecentBooks(50)`. As the catalogue grows this page becomes slow and unwieldy.

**Fix**: Use Firestore's cursor-based pagination (`startAfter(lastDoc)`) with a "Load more" button or URL-based page parameter.

---

## 5. `[key: string]: any` on the `Book` Type

`Book` in `types/aozora.ts` has an escape-hatch index signature that defeats TypeScript's type safety for the entire interface — any typo on a field name silently returns `any`.

**Fix**: Remove it. If there are genuinely unknown fields, use a separate `metadata: Record<string, unknown>` property. All known fields are already documented in `DATA_FORMAT.md`.

---

## 6. Dead Code: `searchBooks` in `books.ts`

`lib/firestore/books.ts` exports a `searchBooks()` function that nothing imports — `actions.ts` inlines its own Firestore queries directly. This causes confusion about which search path is canonical.

**Fix**: Delete `searchBooks` or refactor `actions.ts` to use it.

---

## 7. Missing `/books` Index Page

There is a `/books/new` page and a `/books/[bookId]` detail page, but navigating to `/books` returns a 404. The catalogue has no general browseable entry point.

**Fix**: Add `app/books/page.tsx` — a paginated index optionally filterable by NDC category or kana row (あ行, か行, …).

---

## Summary

| # | Item | Effort | Impact |
|---|---|---|---|
| 1 | Denormalize author name to eliminate N+1 queries | Medium | High |
| 2 | Replace Firestore prefix search with full-text search | Large | High |
| 3 | Parse Aozora markup in the text reader | Medium | High |
| 4 | Paginate `/books/new` | Small | Medium |
| 5 | Remove `[key: string]: any` from `Book` | Small | Medium |
| 6 | Remove or consolidate dead `searchBooks` function | Small | Low |
| 7 | Add `/books` index page | Medium | Medium |
