"""Reconvert local UTF-8 text files and upload changed HTML to Cloudflare R2.

For each *.utf8.txt in the local txt-dir:
  1. Convert with the current TextToHtmlConverter to a temp file.
  2. Download the existing HTML from R2.
  3. If the content differs, upload the new HTML to R2.

Usage:
    uv run python scripts/migrate_html_r2.py [--dry-run] [--txt-dir DIR] [--concurrency N]
"""

import argparse
import hashlib
import logging
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import boto3  # type: ignore
from botocore.exceptions import ClientError  # type: ignore

from aozora_data.text_to_html.converter import TextToHtmlConverter

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_TXT_DIR = "/Users/ksato/git/py-aozora-data/utf-8"
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


@dataclass
class Stats:
    changed: int = 0
    unchanged: int = 0
    missing: int = 0   # no HTML in R2 — skipped intentionally
    errors: int = 0
    skipped: int = 0   # dry-run uploads

    @property
    def total(self) -> int:
        return self.changed + self.unchanged + self.missing + self.errors

    def report(self) -> None:
        logger.info(
            "Done. total=%d changed=%d unchanged=%d missing(skipped)=%d errors=%d skipped(dry-run)=%d",
            self.total,
            self.changed,
            self.unchanged,
            self.missing,
            self.errors,
            self.skipped,
        )


def process_file(
    txt_path: Path,
    bucket: str,
    s3,
    dry_run: bool,
) -> str:
    """Convert one TXT file and upload to R2 if the HTML changed.

    Returns one of: 'changed', 'unchanged', 'missing', 'error'.
    """
    book_id = txt_path.name.replace(".utf8.txt", "")
    html_key = f"{book_id}.utf8.html"

    try:
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False) as tmp:
            tmp_path = tmp.name
        converter = TextToHtmlConverter(str(txt_path), tmp_path)
        converter.convert()
        new_html = Path(tmp_path).read_bytes()
    except Exception as e:
        logger.error("Convert error %s: %s", txt_path.name, e)
        return "error"
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    # Compare MD5 of new HTML against the ETag of the existing R2 object.
    # HeadObject returns headers only (no body download).
    # R2 ETags for single-part uploads are the plain MD5 hex of the content.
    new_md5 = hashlib.md5(new_html).hexdigest()
    try:
        head = s3.head_object(Bucket=bucket, Key=html_key)
        existing_etag = head["ETag"].strip('"')
        outcome = "unchanged" if new_md5 == existing_etag else "changed"
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404", "403"):
            logger.debug("Skipping %s — no HTML in R2", html_key)
            return "missing"
        else:
            logger.error("R2 head error %s: %s", html_key, e)
            return "error"

    if outcome == "changed":
        if dry_run:
            logger.info("[dry-run] would upload %s (%s)", html_key, outcome)
            return outcome
        try:
            s3.put_object(
                Bucket=bucket,
                Key=html_key,
                Body=new_html,
                ContentType="text/html; charset=utf-8",
            )
            logger.info("Uploaded %s (%s)", html_key, outcome)
        except Exception as e:
            logger.error("Upload error %s: %s", html_key, e)
            return "error"

    return outcome


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--txt-dir",
        default=DEFAULT_TXT_DIR,
        help="Directory containing *.utf8.txt source files (default: %(default)s)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compare but do not upload; log what would change",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=DEFAULT_CONCURRENCY,
        metavar="N",
        help="Number of parallel workers (default: %(default)s)",
    )
    args = parser.parse_args()

    txt_dir = Path(args.txt_dir)
    if not txt_dir.is_dir():
        parser.error(f"--txt-dir does not exist: {txt_dir}")

    bucket = os.environ.get("R2_BUCKET_NAME", "")
    if not bucket:
        parser.error("R2_BUCKET_NAME environment variable is not set")

    txt_files = sorted(txt_dir.glob("*.utf8.txt"))
    logger.info("Found %d TXT files in %s", len(txt_files), txt_dir)
    if args.dry_run:
        logger.info("Dry-run mode — no files will be uploaded")

    s3 = _r2_client()
    stats = Stats()

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {
            executor.submit(process_file, p, bucket, s3, args.dry_run): p
            for p in txt_files
        }
        for future in as_completed(futures):
            result = future.result()
            match result:
                case "changed":
                    stats.changed += 1
                case "unchanged":
                    stats.unchanged += 1
                case "missing":
                    stats.missing += 1
                case "error":
                    stats.errors += 1

    if args.dry_run:
        stats.skipped = stats.changed

    stats.report()


if __name__ == "__main__":
    main()
