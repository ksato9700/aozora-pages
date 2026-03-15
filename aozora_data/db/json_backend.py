import json
import logging
import os
from pathlib import Path
from typing import Any

import boto3  # type: ignore
from botocore.client import BaseClient  # type: ignore
from botocore.exceptions import ClientError  # type: ignore

logger = logging.getLogger(__name__)

R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "")
WATERMARK_KEY = "watermark.json"


def _r2_client() -> BaseClient:
    """Create a boto3 S3 client pointed at Cloudflare R2."""
    return boto3.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


class AozoraJSON:
    """JSON-backed data store for Aozora Bunko data.

    Accumulates data in memory during the import run, then writes three
    JSON files (books.json, persons.json, contributors.json) via flush().
    The last_modified watermark is persisted in Cloudflare R2.
    """

    def __init__(self) -> None:
        """Initialize in-memory data stores."""
        self._books: dict[str, dict[str, Any]] = {}
        self._persons: dict[str, dict[str, Any]] = {}
        self._contributors: dict[str, dict[str, Any]] = {}

    def get_watermark(self) -> str | None:
        """Read last_modified watermark from R2. Returns None on any error."""
        if not R2_BUCKET_NAME:
            logger.info("R2 not configured — skipping watermark read, will do full import")
            return None
        try:
            s3 = _r2_client()
            obj = s3.get_object(Bucket=R2_BUCKET_NAME, Key=WATERMARK_KEY)
            data = json.loads(obj["Body"].read())
            return data.get("last_modified")
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchKey":
                logger.info("No watermark found in R2 — will do full import")
            else:
                logger.warning(f"Failed to read watermark from R2: {e}")
        except Exception as e:
            logger.warning(f"Failed to read watermark from R2: {e}")
        return None

    def save_watermark(self, date_str: str) -> None:
        """Write last_modified watermark to R2."""
        if not R2_BUCKET_NAME:
            logger.info("R2 not configured — skipping watermark save")
            return
        logger.info(f"Saving watermark: {date_str}")
        try:
            s3 = _r2_client()
            s3.put_object(
                Bucket=R2_BUCKET_NAME,
                Key=WATERMARK_KEY,
                Body=json.dumps({"last_modified": date_str}),
                ContentType="application/json",
            )
        except Exception as e:
            logger.warning(f"Failed to save watermark to R2: {e}")

    def upsert_book(self, book_id: str, data: dict[str, Any]) -> None:
        """Accumulate a book record in memory."""
        if book_id not in self._books:
            logger.info(f"Upserting book: {book_id}")
            self._books[book_id] = {**data, "book_id": book_id}
        else:
            self._books[book_id].update(data)
            self._books[book_id]["book_id"] = book_id  # restore string form

    def upsert_person(self, person_id: str, data: dict[str, Any]) -> None:
        """Accumulate a person record in memory."""
        if person_id not in self._persons:
            logger.info(f"Upserting person: {person_id}")
            self._persons[person_id] = {**data, "person_id": person_id}
        else:
            self._persons[person_id].update(data)
            self._persons[person_id]["person_id"] = person_id  # restore string form

    def upsert_contributor(self, contributor_id: str, data: dict[str, Any]) -> None:
        """Accumulate a contributor record in memory."""
        if contributor_id not in self._contributors:
            logger.info(f"Upserting contributor: {contributor_id}")
            self._contributors[contributor_id] = data
        else:
            self._contributors[contributor_id].update(data)

    def update_book_author(self, book_id: str, data: dict[str, Any]) -> None:
        """Merge author_name and author_id into an in-memory book record."""
        logger.info(f"Updating book author: {book_id}")
        if book_id in self._books:
            self._books[book_id].update(data)
        else:
            self._books[book_id] = {**data, "book_id": book_id}

    def commit(self) -> None:
        """No-op: data stays in memory until flush() is called."""

    def flush(self, output_dir: str | Path) -> None:
        """Write books.json, persons.json, and contributors.json to output_dir."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        books_path = out / "books.json"
        persons_path = out / "persons.json"
        contributors_path = out / "contributors.json"

        with books_path.open("w", encoding="utf-8") as f:
            json.dump(list(self._books.values()), f, ensure_ascii=False)
        logger.info(f"Wrote {len(self._books)} books to {books_path}")

        with persons_path.open("w", encoding="utf-8") as f:
            json.dump(list(self._persons.values()), f, ensure_ascii=False)
        logger.info(f"Wrote {len(self._persons)} persons to {persons_path}")

        with contributors_path.open("w", encoding="utf-8") as f:
            json.dump(list(self._contributors.values()), f, ensure_ascii=False)
        logger.info(f"Wrote {len(self._contributors)} contributors to {contributors_path}")

    def upload_json_to_r2(self, output_dir: str | Path) -> None:
        """Upload books.json, persons.json, and contributors.json to R2 under data/."""
        if not R2_BUCKET_NAME:
            logger.info("R2 not configured — skipping JSON upload")
            return
        out = Path(output_dir)
        s3 = _r2_client()
        for name in ("books.json", "persons.json", "contributors.json"):
            path = out / name
            try:
                s3.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=f"data/{name}",
                    Body=path.read_bytes(),
                    ContentType="application/json",
                )
                logger.info("Uploaded data/%s to R2", name)
            except Exception as e:
                logger.warning("Failed to upload data/%s to R2: %s", name, e)
