# Design: Denormalize Author Name into `books` Documents

## Problem

Every page that renders a book list makes additional Firestore reads solely to display the author's name. The current call chain is:

```
getRecentBooks(N)                     → 1 query
  └─ getContributorsForBook(book_id)  → N queries (one per book)
       └─ getPerson(person_id)        → N × M queries (one per contributor)
```

Where M is the number of contributors per book (usually 1–2). On the home page (N=6) this totals roughly **13 reads**. On `/books/new` (N=50) it totals roughly **100–150 reads** per page load. The search Server Action has the same pattern for every book in the results.

All of these extra reads are just to produce a single string, e.g. `"夏目 漱石"`, passed as the `authorName` prop to `BookCard`.

---

## Goal

Reduce the read count for any book listing page to **1 query** (the books query itself), with no follow-up reads for author display.

---

## Proposed Solution: Denormalize `author_name` into `books`

Store a pre-computed `author_name` string and `author_id` integer directly on each `books` document at import time. The primary author is the contributor with role `0` (著者). If no role-0 contributor exists, fall back to the first contributor in the CSV for that book.

### New fields on `books` documents

| Field | Type | Description |
|---|---|---|
| `author_name` | String | Full name formatted as `"{last_name} {first_name}"`, e.g. `"夏目 漱石"`. Empty string if no contributor found. |
| `author_id` | Integer | `person_id` of the primary author. `None` if no contributor found. |

`author_name` is the display string. `author_id` is kept so the book card can link to `/persons/[id]` in the future without an extra lookup.

---

## Affected Components

### 1. `py-aozora-data/aozora_data/db/firestore.py`

**The challenge**: `upsert_book` guards against writing the same book twice using the `seen_books` set. The author fields cannot be included in the initial `book_data` dict because the role is parsed after `upsert_book` is called, and the first CSV row for a book may not be the author row (e.g. it might be a translator).

**Fix**: Add a new `update_book_author` method that writes author fields via a second, separate batch pass after the main loop. This method intentionally bypasses the `seen_books` guard and uses `merge=True` to patch existing documents.

```python
# Add after upsert_contributor()

def update_book_author(self, book_id: str, data: dict[str, Any]) -> None:
    """Write author_name and author_id onto an existing book document."""
    ref = self.db.collection("books").document(book_id)
    logger.info(f"Updating book author: {book_id}")
    self.batch.set(ref, data, merge=True)
    self.batch_count += 1
    self._flush_batch_if_needed()
```

### 2. `py-aozora-data/aozora_data/importer/csv_importer.py`

**The challenge**: The CSV has one row per (book, contributor) pair. A book with multiple contributors has multiple rows with the same `book_id`. The correct author may appear in any row, so we must scan all rows before we can determine which contributor gets stored on the book document.

**Fix**: Accumulate author candidates in two dicts during the main loop, then do a second batch after `db.commit()`.

**Step 1** — Add two dicts before the loop in `import_from_csv`:

```python
# Maps book_id -> {author_name, author_id} for role-0 contributors
author_map: dict[str, dict] = {}
# Maps book_id -> {author_name, author_id} for first contributor seen (fallback)
first_contributor_map: dict[str, dict] = {}
```

**Step 2** — Populate the dicts inside the loop, after `role_id` is computed (i.e. after line 213):

```python
author_name = f"{row['last_name']} {row['first_name']}"
author_entry = {"author_name": author_name, "author_id": _parse_int(person_id)}

if role_id == 0:
    author_map[book_id] = author_entry
if book_id not in first_contributor_map:
    first_contributor_map[book_id] = author_entry
```

**Step 3** — After the existing `db.commit()` call (line 232) and before `db.save_watermark()`, add a second batch pass:

```python
# Write author_name / author_id onto each book document
for book_id in first_contributor_map:
    data = author_map.get(book_id) or first_contributor_map[book_id]
    db.update_book_author(book_id, data)

db.commit()
```

The full tail of `import_from_csv` after these changes:

```python
    # Commit main batch (books, persons, contributors)
    db.commit()

    # Second pass: write author_name / author_id onto book documents
    for book_id in first_contributor_map:
        data = author_map.get(book_id) or first_contributor_map[book_id]
        db.update_book_author(book_id, data)

    db.commit()

    # Save new watermark
    if max_last_modified:
        db.save_watermark(max_last_modified)
```

### 3. `py-aozora-data/tests/test_csv_importer.py`

**`FakeFirestore`** must implement the new method. Since the fake stores books in `stored_books`, `update_book_author` can merge into it:

```python
def update_book_author(self, book_id: str, data: dict):
    if book_id in self.stored_books:
        self.stored_books[book_id].update(data)
    else:
        self.stored_books[book_id] = data
```

**`test_import_from_csv`** should assert the new fields. From the test CSV (`tests/data/test.csv`), the expected values are:

| `book_id` | Role in CSV | Expected `author_name` | Expected `author_id` |
|---|---|---|---|
| `10003` | 著者 (role 0) | `"last_name_03 first_name_03"` | `20003` |
| `10001` | 翻訳者 (role 1, fallback) | `"last_name_01 first_name_01"` | `20001` |
| `10000` | 編者 (role 2, fallback) | `"last_name_00 first_name_00"` | `20000` |
| `10002` | 校訂者 (role 3, fallback) | `"last_name_02 first_name_02"` | `20002` |

Add these assertions to `test_import_from_csv`:

```python
# Author denormalization
assert db.stored_books["10003"]["author_name"] == "last_name_03 first_name_03"
assert db.stored_books["10003"]["author_id"] == 20003

# Fallback: no role-0 contributor, first contributor used
assert db.stored_books["10001"]["author_name"] == "last_name_01 first_name_01"
assert db.stored_books["10001"]["author_id"] == 20001
```

### 4. `web/src/types/aozora.ts` — `Book` interface

Add the two new optional fields:

```ts
export interface Book {
  // ...existing fields...
  author_name?: string;
  author_id?: number;
}
```

They are optional so that existing documents without the fields (before migration) continue to type-check.

### 5. `web/src/app/page.tsx` (Home page)

Remove the contributor-fetching block. Pass `book.author_name` directly to `BookCard`.

```ts
// Before
const authors: Record<string, string> = {};
await Promise.all(recentBooks.map(async (book) => {
    const contributors = await getContributorsForBook(book.book_id);
    const author = contributors.find(c => c.role === 0) || contributors[0];
    if (author) {
        authors[book.book_id] = `${author.person.last_name} ${author.person.first_name}`;
    }
}));
// ...
<BookCard book={book} authorName={authors[book.book_id]} />

// After
<BookCard book={book} authorName={book.author_name} />
```

Also remove the now-unused import of `getContributorsForBook`.

### 6. `web/src/app/books/new/page.tsx`

Same change as the home page — remove the contributor loop, use `book.author_name`, remove the import of `getContributorsForBook`.

### 7. `web/src/app/actions.ts` — `search()`

Remove the `getContributorsForBook` enrichment loop. Read `author_name` from the document directly.

```ts
// Before
const { getContributorsForBook } = await import('@/lib/firestore/contributors');
const enrichedBooks = await Promise.all(books.map(async (book) => {
    const contributors = await getContributorsForBook(book.book_id);
    const author = contributors.find(c => c.role === 0)?.person;
    return {
        ...book,
        authorName: author ? `${author.last_name} ${author.first_name}` : undefined
    };
}));

// After
const enrichedBooks = books.map(book => ({
    ...book,
    authorName: book.author_name,
}));
```

The dynamic import of `contributors` can be removed entirely. `search()` no longer needs to be `async` (though it remains so for the outer Firestore queries).

### 8. `web/src/components/BookCard.tsx` — no changes required

`BookCard` already accepts `authorName?: string` and renders it.

### 9. `web/src/lib/firestore/books.ts` — no changes required

`getRecentBooks` and `getBook` return the full document; the new fields come along automatically.

---

## Migration Plan

Existing `books` documents in Firestore were written before this change and do not have `author_name` or `author_id`. They must be backfilled before the app changes are deployed.

### Preferred: Re-run the importer

`py-aozora-data` supports full re-imports. Run it after deploying the importer changes. Because `upsert_book` uses `merge=True`, all existing fields are preserved and only `author_name` / `author_id` are added.

To force a full re-import (ignore the watermark), clear the `config/import_state` document in Firestore before running, or add a `--force` flag to the importer's CLI if one is available.

### Rollout order

1. Merge and deploy the `py-aozora-data` changes.
2. Run a full re-import to backfill all existing `books` documents.
3. Merge and deploy the `aozora-pages` (web) changes.

Steps 1–2 can be done before step 3 with no user-visible change. The web app continues using the contributor path until step 3 is deployed.

---

## Trade-offs

| Consideration | Notes |
|---|---|
| Data consistency | `author_name` on `books` will drift if a `persons` document is later corrected. Name corrections are rare in the Aozora Bunko catalogue. A re-import will fix any drift. |
| Multi-author works | Only the primary author (role 0) is stored. For book cards this is sufficient. The full contributor list is still fetched on `/books/[bookId]`, where completeness matters. |
| Storage cost | Two extra fields per book document. Negligible. |
| Complexity | Moves resolution logic from read time to write time. This is the right direction — compute once, read many. |

---

## Out of Scope

- The `/books/[bookId]` detail page fetches the full contributor list to display all roles (著者, 翻訳者, 編者, etc.). This is intentional and not affected by this change.
- The `/persons/[personId]` page fetches all works for a person. Also not affected.
