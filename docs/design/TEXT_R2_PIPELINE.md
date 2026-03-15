# Design: Text & HTML R2 Pipeline in Import Container

**Status:** Proposed
**Date:** 2026-03-15
**Context:** Currently, SJIS→UTF-8 conversion and HTML generation are manual local steps.
This document proposes integrating them into the Cloud Run Job so new and updated books
are processed automatically on every daily import run.

---

## 1. Current Pipeline

```
Cloud Run Job
  └── python -m aozora_data.importer.main
        ├── fetch CSV → upsert books/persons/contributors → books.json / persons.json / contributors.json
        ├── sync changed records → Algolia
        ├── save watermark → R2
        └── npx astro build → wrangler pages deploy
```

Text and HTML files in R2 are updated manually.

---

## 2. Target Pipeline

```
Cloud Run Job
  └── python -m aozora_data.importer.main
        ├── fetch CSV → upsert + flush JSON → Algolia → watermark
        ├── [NEW] for each new/updated non-copyrighted ShiftJIS book:
        │     ├── download SJIS ZIP from aozora.gr.jp (in-memory)
        │     ├── convert SJIS → UTF-8 (sjis_to_utf8)
        │     ├── upload UTF-8 text to R2  (<book_id>.utf8.txt)
        │     ├── convert UTF-8 → HTML (text_to_html)
        │     └── upload HTML to R2  (<book_id>.utf8.html)
        └── npx astro build → wrangler pages deploy
```

---

## 3. Identifying Books to Process

The CSV importer already uses a watermark (`last_modified`) to detect changed records
for Algolia. The same mechanism is used to identify books needing text/HTML updates:

- `last_modified > watermark` — book is new or its catalog entry changed (which always
  accompanies a text update on Aozora Bunko)
- `copyright == False` — skip copyrighted books
- `text_encoding == 'ShiftJIS'` — only process ShiftJIS books (a small number of books
  are encoded in UTF-8 already; these are served directly from the Aozora Bunko URL)
- `text_url.endswith('.zip')` — must be a ZIP archive

Books matching all four criteria are collected during CSV import and passed to the text
pipeline.

---

## 4. Code Changes

### 4.1 `aozora_data/importer/csv_importer.py`

Change `import_from_csv` to return changed book records alongside the watermark:

```python
# Before
def import_from_csv(...) -> str | None:
    ...
    return max_last_modified

# After
def import_from_csv(...) -> tuple[str | None, list[dict]]:
    ...
    changed_books: list[dict] = []
    # Inside the loop, where is_changed is True:
    if is_changed:
        changed_books.append(book_data)
    ...
    return max_last_modified, changed_books
```

`import_from_csv_url` passes this through unchanged.

### 4.2 New module `aozora_data/text_r2_pipeline.py`

Handles download, conversion, and R2 upload for a list of book records.
All processing is done in-memory (no temp files).

```python
"""Download, convert, and upload SJIS→UTF-8→HTML for changed books."""

import hashlib
import io
import logging
import os
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
import requests

from .sjis_to_utf8.converter import convert_content
from .text_to_html.converter import TextToHtmlConverter

logger = logging.getLogger(__name__)

DEFAULT_CONCURRENCY = 8


def _r2_client():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _upload_if_changed(s3, bucket: str, key: str, body: bytes, content_type: str) -> str:
    """Upload body to R2 only if the ETag (MD5) differs. Returns 'uploaded' or 'unchanged'."""
    new_md5 = hashlib.md5(body).hexdigest()
    try:
        head = s3.head_object(Bucket=bucket, Key=key)
        if head["ETag"].strip('"') == new_md5:
            return "unchanged"
    except s3.exceptions.ClientError:
        pass  # Key does not exist — upload unconditionally
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type)
    return "uploaded"


def _process_book(book: dict, s3, bucket: str) -> str:
    """Download, convert, and upload one book. Returns 'ok' or 'error'."""
    book_id = str(book["book_id"]).zfill(6)
    url = book.get("text_url", "")

    try:
        # 1. Download SJIS ZIP
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            txt_name = next((n for n in z.namelist() if n.lower().endswith(".txt")), None)
            if not txt_name:
                logger.error("No .txt in ZIP for book %s", book_id)
                return "error"
            sjis_bytes = z.read(txt_name)

        # 2. SJIS → UTF-8
        utf8_text = convert_content(sjis_bytes)
        utf8_bytes = utf8_text.encode("utf-8")

        # 3. Upload UTF-8 text
        txt_key = f"{book_id}.utf8.txt"
        txt_result = _upload_if_changed(s3, bucket, txt_key, utf8_bytes, "text/plain; charset=utf-8")
        logger.info("text %s: %s", txt_key, txt_result)

        # 4. UTF-8 → HTML (TextToHtmlConverter works with file paths; use a temp file)
        import tempfile
        from pathlib import Path
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w", encoding="utf-8") as tf:
            tf.write(utf8_text)
            txt_tmp = tf.name
        html_tmp = txt_tmp.replace(".txt", ".html")
        try:
            TextToHtmlConverter(txt_tmp, html_tmp).convert()
            html_bytes = Path(html_tmp).read_bytes()
        finally:
            Path(txt_tmp).unlink(missing_ok=True)
            Path(html_tmp).unlink(missing_ok=True)

        # 5. Upload HTML
        html_key = f"{book_id}.utf8.html"
        html_result = _upload_if_changed(s3, bucket, html_key, html_bytes, "text/html; charset=utf-8")
        logger.info("html  %s: %s", html_key, html_result)

        return "ok"

    except Exception as e:
        logger.error("Failed to process book %s: %s", book_id, e)
        return "error"


def process_books(books: list[dict], concurrency: int = DEFAULT_CONCURRENCY) -> None:
    """Download, convert, and upload text+HTML for a list of book records.

    Skips books that are copyrighted, non-ShiftJIS, or have no ZIP text_url.
    """
    bucket = os.environ.get("R2_BUCKET_NAME", "")
    if not bucket:
        logger.warning("R2_BUCKET_NAME not set — skipping text/HTML pipeline")
        return

    eligible = [
        b for b in books
        if not b.get("copyright")
        and b.get("text_encoding") == "ShiftJIS"
        and (b.get("text_url") or "").lower().endswith(".zip")
    ]

    if not eligible:
        logger.info("No new/updated ShiftJIS books to process")
        return

    logger.info("Processing text/HTML for %d book(s)", len(eligible))
    s3 = _r2_client()
    ok = errors = 0

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(_process_book, b, s3, bucket): b for b in eligible}
        for future in as_completed(futures):
            if future.result() == "ok":
                ok += 1
            else:
                errors += 1

    logger.info("Text/HTML pipeline done: ok=%d errors=%d", ok, errors)
```

### 4.3 `aozora_data/importer/main.py`

Call the text pipeline after flushing JSON:

```python
from ..text_r2_pipeline import process_books

def main():
    db = AozoraJSON()
    if CSV_URL:
        max_last_modified, changed_books = import_from_csv_url(CSV_URL, db)
        db.flush(DATA_DIR)
        if max_last_modified:
            db.save_watermark(max_last_modified)
        process_books(changed_books)
```

### 4.4 `Dockerfile`

Add the two new modules to the COPY block:

```dockerfile
# Before
COPY aozora_data/__init__.py ./aozora_data/__init__.py
COPY aozora_data/db ./aozora_data/db
COPY aozora_data/importer ./aozora_data/importer
COPY aozora_data/algolia ./aozora_data/algolia

# After
COPY aozora_data/__init__.py          ./aozora_data/__init__.py
COPY aozora_data/db                   ./aozora_data/db
COPY aozora_data/importer             ./aozora_data/importer
COPY aozora_data/algolia              ./aozora_data/algolia
COPY aozora_data/sjis_to_utf8         ./aozora_data/sjis_to_utf8
COPY aozora_data/text_to_html         ./aozora_data/text_to_html
COPY aozora_data/text_r2_pipeline.py  ./aozora_data/text_r2_pipeline.py
```

No new Python dependencies are required — `boto3` and `requests` are already in
`pyproject.toml`.

---

## 5. Environment Variables

No new variables. The pipeline reuses the R2 credentials already injected by
Secret Manager:

| Variable | Used for |
|---|---|
| `R2_ACCOUNT_ID` | R2 endpoint URL |
| `R2_ACCESS_KEY_ID` | R2 authentication |
| `R2_SECRET_ACCESS_KEY` | R2 authentication |
| `R2_BUCKET_NAME` | R2 bucket name |

---

## 6. Error Handling

| Scenario | Behaviour |
|---|---|
| Download failure (network, 404) | Log error, skip book, continue |
| Invalid ZIP or no `.txt` inside | Log error, skip book, continue |
| SJIS decode failure | Log error, skip book, continue |
| HTML conversion failure | Log error, skip book, continue |
| R2 upload failure | Log error, skip book, continue |
| `R2_BUCKET_NAME` not set | Log warning, skip entire pipeline |
| Copyrighted book in changed set | Silently skipped before processing |

Individual failures do not abort the pipeline. The job exits successfully unless
the Astro build or Pages deploy fails.

---

## 7. Implementation Plan

### Commit 1 — `csv_importer.py`: expose changed book records

Change `import_from_csv` and `import_from_csv_url` to return
`tuple[str | None, list[dict]]`. Update callers.

### Commit 2 — `aozora_data/text_r2_pipeline.py`: new pipeline module

Add the module with `process_books()` as the public entry point.
Add unit tests covering the copyright/encoding filter and the ETag skip logic.

### Commit 3 — `importer/main.py` + `Dockerfile`: wire it together

Call `process_books(changed_books)` in `main()`.
Add the two COPY lines to the Dockerfile.

---

## 8. Out of Scope

- **UTF-8 encoded books** (`text_encoding != 'ShiftJIS'`): these are a small minority
  and served from the Aozora Bunko HTML URL rather than R2. No change needed.
- **Retroactive processing**: this pipeline only handles books that appear as
  new/changed in a given daily run. Bulk initial loads (e.g. all 17,000+ books) are
  done with the manual scripts under `scripts/`.
- **Deletion from R2**: if a book is removed from Aozora Bunko, its R2 objects are
  not automatically deleted. This is acceptable given how rarely books are removed.
