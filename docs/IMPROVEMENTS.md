# Improvement Suggestions

## 1. No Pagination on `/books/new`

The page hardcodes `getRecentBooks(50)`. As the catalogue grows this page becomes slow and unwieldy.

**Fix**: Use Firestore's cursor-based pagination (`startAfter(lastDoc)`) with a "Load more" button or URL-based page parameter.

---

## 2. `[key: string]: any` on the `Book` Type

`Book` in `types/aozora.ts` has an escape-hatch index signature that defeats TypeScript's type safety for the entire interface — any typo on a field name silently returns `any`.

**Fix**: Remove it. If there are genuinely unknown fields, use a separate `metadata: Record<string, unknown>` property. All known fields are already documented in `DATA_FORMAT.md`.

---

## 3. Dead Code: `searchBooks` and `searchPersons` in Firestore lib

`lib/firestore/books.ts` and `lib/firestore/persons.ts` export `searchBooks()` / `searchPersons()` functions that are no longer used for the main search — `actions.ts` now delegates to Algolia. These cause confusion about which search path is canonical.

**Fix**: Delete them, or migrate the `/books` and `/persons` page search to Algolia as well.

---

## 4. Missing `/books` Index Page

There is a `/books/new` page and a `/books/[bookId]` detail page, but navigating to `/books` returns a 404. The catalogue has no general browseable entry point.

**Fix**: Add `app/books/page.tsx` — a paginated index optionally filterable by NDC category or kana row (あ行, か行, …).

---

## Summary

| # | Item | Effort | Impact |
|---|---|---|---|
| 1 | Paginate `/books/new` | Small | Medium |
| 2 | Remove `[key: string]: any` from `Book` | Small | Medium |
| 3 | Remove or consolidate dead search functions | Small | Low |
| 4 | Add `/books` index page | Medium | Medium |
