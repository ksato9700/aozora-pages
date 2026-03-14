# Aozora Bunko Data Format (JSON Files)

This document describes the data format used by the `aozora_data` import pipeline when generating JSON files for Astro to consume at build time.

## Overview

The import pipeline writes three JSON files to `astro/data/` (inside the container at `/astro/data/`):

- `books.json` — array of all book objects
- `persons.json` — array of all person objects
- `contributors.json` — array of book–person–role relationships

A fourth file, `watermark.json`, is stored in Cloudflare R2 (not in the container) to persist the last-processed date between daily runs.

---

## `books.json`

Array of book objects. Each object corresponds to one book in the Aozora Bunko catalogue.

**`book_id`**: string, zero-padded to 6 digits (e.g. `"001234"`) — used as the Astro route param.

| Field | Type | Description |
|---|---|---|
| `book_id` | String | Unique identifier, zero-padded to 6 digits |
| `title` | String | Title of the book |
| `title_yomi` | String | Phonetic reading (yomi) of the title |
| `title_sort` | String | Sort key for the title |
| `subtitle` | String? | Subtitle |
| `subtitle_yomi` | String? | Phonetic reading of the subtitle |
| `original_title` | String? | Original title (if translated) |
| `first_appearance` | String? | First publication info |
| `ndc_code` | String? | NDC (Nippon Decimal Classification) code |
| `font_kana_type` | String? | Font/Kana usage type (e.g. "新字新仮名") |
| `copyright` | Boolean | `true` if under copyright, `false` for public domain |
| `release_date` | String | Release date on Aozora Bunko (ISO date string) |
| `last_modified` | String | Last modified date of the catalogue entry |
| `card_url` | String | URL to the Aozora Bunko card page |
| `text_url` | String? | URL to the plain text file |
| `html_url` | String? | URL to the HTML file |
| `base_book_1` | String? | Base book information |
| `base_book_1_publisher` | String? | Publisher of the base book |
| `input` | String? | Name of the person who digitized the text |
| `proofing` | String? | Name of the proofreader |
| `author_name` | String? | Denormalized primary author name (e.g. `"夏目 漱石"`) |
| `author_id` | Integer? | Denormalized primary author `person_id` |

> `author_name` and `author_id` are written during the second pass of the importer. Role 0 (著者) takes priority; the first contributor is used as fallback.

---

## `persons.json`

Array of person objects. Each object corresponds to one author, translator, editor, etc.

**`person_id`**: string, zero-padded to 6 digits (e.g. `"000567"`).

| Field | Type | Description |
|---|---|---|
| `person_id` | String | Unique identifier, zero-padded to 6 digits |
| `first_name` | String | First name |
| `last_name` | String | Last name |
| `last_name_yomi` | String | Phonetic reading of last name |
| `first_name_yomi` | String | Phonetic reading of first name |
| `first_name_sort` | String | Sort key for first name |
| `last_name_sort` | String | Sort key for last name |
| `first_name_roman` | String? | Romanized first name |
| `last_name_roman` | String? | Romanized last name |
| `date_of_birth` | String? | Date of birth |
| `date_of_death` | String? | Date of death |
| `author_copyright` | Boolean? | `true` if the author's texts are still under copyright |

---

## `contributors.json`

Array of book–person–role relationships.

| Field | Type | Description |
|---|---|---|
| `id` | String | Composite ID: `{book_id}-{person_id}-{role_id}` |
| `book_id` | Integer | Book ID (integer, not zero-padded) |
| `person_id` | Integer | Person ID (integer, not zero-padded) |
| `role` | Integer | Role ID (see Role Mapping below) |

**Role Mapping**:

| ID | Label |
|---|---|
| `0` | 著者 (Author) |
| `1` | 翻訳者 (Translator) |
| `2` | 編者 (Editor) |
| `3` | 校訂者 (Revisor) |
| `4` | その他 (Other) |

> Note: `book_id` and `person_id` in contributors are integers. The Astro data loader (`data.ts`) pads them with `toString().padStart(6, '0')` to match the string IDs in `books.json` and `persons.json`.

---

## `watermark.json` (stored in Cloudflare R2)

A small JSON file persisted in R2 between daily runs. Not part of the Astro build.

```json
{ "last_modified": "2026-03-14" }
```

The importer reads this value at the start of each run and uses it to determine which CSV rows are new (for Algolia incremental updates). The watermark is written to R2 after the JSON files are flushed, so a crash between flush and watermark write leaves the watermark un-advanced and the next run safely reprocesses the same records.
