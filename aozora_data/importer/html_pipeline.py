"""Download, convert and upload HTML for changed books.

For each changed book that has a zip text_url:
  1. Download the zip and extract the .txt file.
  2. Convert SJIS bytes → UTF-8 string (skipped for UTF-8 encoded books).
  3. Convert UTF-8 text → HTML via TextToHtmlConverter (uses temp files).
  4. Upload the HTML to R2 as {book_id}.utf8.html.
"""

import io
import logging
import tempfile
import zipfile
from pathlib import Path

import requests

from ..db.json_backend import R2_BUCKET_NAME, _r2_client
from ..sjis_to_utf8.converter import convert_content
from ..text_to_html.converter import TextToHtmlConverter

logger = logging.getLogger(__name__)


def _process_book(book: dict, s3, bucket: str) -> str:
    """Download, convert and upload HTML for one book.

    Returns one of: 'uploaded', 'skipped', 'error'.
    """
    book_id = str(book.get("book_id", ""))
    text_url = book.get("text_url", "")
    text_encoding = book.get("text_encoding", "")

    if book.get("copyright"):
        logger.debug("Skipping book %s — copyrighted", book_id)
        return "skipped"

    if not text_url or not text_url.lower().endswith(".zip"):
        logger.debug("Skipping book %s — no zip text_url", book_id)
        return "skipped"

    # Download zip and extract the .txt file
    try:
        resp = requests.get(text_url, timeout=30)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
            txt_name = next((n for n in z.namelist() if n.lower().endswith(".txt")), None)
            if not txt_name:
                logger.error("No .txt in zip for book %s (%s)", book_id, text_url)
                return "error"
            raw_bytes = z.read(txt_name)
    except Exception as e:
        logger.error("Download failed for book %s: %s", book_id, e)
        return "error"

    # Decode to UTF-8 string
    try:
        if "utf" in text_encoding.lower():
            utf8_text = raw_bytes.decode("utf-8-sig")
        else:
            utf8_text = convert_content(raw_bytes)
    except Exception as e:
        logger.error("Text decoding failed for book %s: %s", book_id, e)
        return "error"

    # Convert text → HTML via temp files (TextToHtmlConverter is file-based)
    txt_tmp = html_tmp = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", encoding="utf-8", delete=False) as f:
            txt_tmp = f.name
            f.write(utf8_text)
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as f:
            html_tmp = f.name

        TextToHtmlConverter(txt_tmp, html_tmp).convert()
        html_bytes = Path(html_tmp).read_bytes()
    except Exception as e:
        logger.error("HTML conversion failed for book %s: %s", book_id, e)
        return "error"
    finally:
        if txt_tmp:
            Path(txt_tmp).unlink(missing_ok=True)
        if html_tmp:
            Path(html_tmp).unlink(missing_ok=True)

    # Upload UTF-8 text and HTML to R2
    try:
        s3.put_object(
            Bucket=bucket,
            Key=f"{book_id}.utf8.txt",
            Body=utf8_text.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )
        logger.info("Uploaded %s.utf8.txt", book_id)
    except Exception as e:
        logger.error("R2 upload failed for %s.utf8.txt: %s", book_id, e)
        return "error"

    try:
        s3.put_object(
            Bucket=bucket,
            Key=f"{book_id}.utf8.html",
            Body=html_bytes,
            ContentType="text/html; charset=utf-8",
        )
        logger.info("Uploaded %s.utf8.html", book_id)
        return "uploaded"
    except Exception as e:
        logger.error("R2 upload failed for %s.utf8.html: %s", book_id, e)
        return "error"


def upload_html_for_changed_books(changed_books: list[dict]) -> None:
    """Convert and upload HTML for all changed books."""
    if not changed_books:
        return
    if not R2_BUCKET_NAME:
        logger.info("R2 not configured — skipping HTML upload")
        return

    s3 = _r2_client()
    uploaded = skipped = errors = 0

    for book in changed_books:
        outcome = _process_book(book, s3, R2_BUCKET_NAME)
        if outcome == "uploaded":
            uploaded += 1
        elif outcome == "skipped":
            skipped += 1
        else:
            errors += 1

    logger.info(
        "HTML pipeline done: uploaded=%d skipped=%d errors=%d",
        uploaded,
        skipped,
        errors,
    )
