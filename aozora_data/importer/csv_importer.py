import logging
from csv import DictReader
from io import BytesIO
from typing import TextIO

import requests

from ..db import AozoraDB

logger = logging.getLogger(__name__)

FIELD_NAMES = (
    "book_id",
    "title",
    "title_yomi",
    "title_sort",
    "subtitle",
    "subtitle_yomi",
    "original_title",
    "first_appearance",
    "ndc_code",
    "font_kana_type",
    "copyright",
    "release_date",
    "last_modified",
    "card_url",
    "person_id",
    "last_name",
    "first_name",
    "last_name_yomi",
    "first_name_yomi",
    "last_name_sort",
    "first_name_sort",
    "last_name_roman",
    "first_name_roman",
    "role",
    "date_of_birth",
    "date_of_death",
    "author_copyright",
    "base_book_1",
    "base_book_1_publisher",
    "base_book_1_1st_edition",
    "base_book_1_edition_input",
    "base_book_1_edition_proofing",
    "base_book_1_parent",
    "base_book_1_parent_publisher",
    "base_book_1_parent_1st_edition",
    "base_book_2",
    "base_book_2_publisher",
    "base_book_2_1st_edition",
    "base_book_2_edition_input",
    "base_book_2_edition_proofing",
    "base_book_2_parent",
    "base_book_2_parent_publisher",
    "base_book_2_parent_1st_edition",
    "input",
    "proofing",
    "text_url",
    "text_last_modified",
    "text_encoding",
    "text_charset",
    "text_updated",
    "html_url",
    "html_last_modified",
    "html_encoding",
    "html_charset",
    "html_updated",
)


def _parse_date(val: str) -> str | None:
    """Return date string as is, or None if empty."""
    # The CSV date format is typically YYYY-MM-DD.
    return val if val else None


def _parse_int(val: str) -> int:
    return int(val) if val else 0


def _parse_bool(val: str) -> bool:
    return val != "なし"


def _parse_role(val: str) -> int:
    # Map Japanese roles to IDs manually if needed, or just store the string?
    # Original model.py had Mapping.
    # AUTHOR = 0, TRANSLATOR = 1, EDITOR = 2, REVISOR = 3, OTHER = 4
    if val == "著者":
        return 0
    if val == "翻訳者":
        return 1
    if val == "編者":
        return 2
    if val == "校訂者":
        return 3
    if val == "その他":
        return 4
    return 4


def _process_row(
    row: dict,
    db: AozoraDB,
    author_map: dict,
    first_contributor_map: dict,
    algolia_books: dict,
    algolia_persons: dict,
) -> dict:
    """Upsert one CSV row (book, person, contributor) into the DB and collect Algolia records."""
    book_id = row["book_id"].zfill(6)
    person_id = row["person_id"].zfill(6)

    book_data = {
        "book_id": book_id,
        "title": row["title"],
        "title_yomi": row["title_yomi"],
        "title_sort": row["title_sort"],
        "subtitle": row["subtitle"],
        "subtitle_yomi": row["subtitle_yomi"],
        "original_title": row["original_title"],
        "first_appearance": row["first_appearance"],
        "ndc_code": row["ndc_code"],
        "font_kana_type": row["font_kana_type"],
        "copyright": _parse_bool(row["copyright"]),
        "release_date": _parse_date(row["release_date"]),
        "last_modified": _parse_date(row["last_modified"]),
        "card_url": row["card_url"],
        "base_book_1": row["base_book_1"],
        "base_book_1_publisher": row["base_book_1_publisher"],
        # ... include other book fields ...
        "input": row["input"],
        "proofing": row["proofing"],
        "text_url": row["text_url"],
        "text_last_modified": _parse_date(row["text_last_modified"]),
        "text_encoding": row["text_encoding"],
        "text_charset": row["text_charset"],
        "text_updated": _parse_int(row["text_updated"]),
        "html_url": row["html_url"],
        "html_last_modified": _parse_date(row["html_last_modified"]),
        "html_encoding": row["html_encoding"],
        "html_charset": row["html_charset"],
        "html_updated": _parse_int(row["html_updated"]),
    }
    db.upsert_book(book_id, book_data)
    algolia_books[book_id] = {  # type: ignore[index]
        "objectID": book_id,
        "book_id": book_id,
        "title": book_data["title"],
        "title_yomi": book_data["title_yomi"],
        "font_kana_type": book_data["font_kana_type"],
        "copyright": book_data["copyright"],
    }

    person_data = {
        "person_id": person_id,
        "first_name": row["first_name"],
        "last_name": row["last_name"],
        "last_name_yomi": row["last_name_yomi"],
        "first_name_yomi": row["first_name_yomi"],
        "last_name_sort": row["last_name_sort"],
        "first_name_sort": row["first_name_sort"],
        "last_name_roman": row["last_name_roman"],
        "first_name_roman": row["first_name_roman"],
        "date_of_birth": row["date_of_birth"],
        "date_of_death": row["date_of_death"],
        "author_copyright": _parse_bool(row["author_copyright"]),
    }
    db.upsert_person(person_id, person_data)
    algolia_persons[person_id] = {
        "objectID": person_id,
        "person_id": person_id,
        "last_name": person_data["last_name"],
        "first_name": person_data["first_name"],
        "last_name_yomi": person_data["last_name_yomi"],
        "first_name_yomi": person_data["first_name_yomi"],
    }

    role_id = _parse_role(row["role"])
    contributor_id = f"{book_id}-{person_id}-{role_id}"
    db.upsert_contributor(
        contributor_id,
        {
            "id": contributor_id,
            "book_id": book_id,
            "person_id": person_id,
            "role": role_id,
        },
    )

    author_entry = {
        "author_name": f"{row['last_name']} {row['first_name']}",
        "author_id": person_id,
    }
    if role_id == 0:
        author_map[book_id] = author_entry
    if book_id not in first_contributor_map:
        first_contributor_map[book_id] = author_entry

    return book_data


def import_from_csv_url(csv_url: str, db: AozoraDB, limit: int = 0) -> tuple[str | None, list[dict]]:
    """Import books, persons, and contributors from a CSV file URL."""
    resp = requests.get(csv_url)
    resp.raise_for_status()
    with BytesIO(resp.content) as b_stream:
        # Handling zip files in memory
        from zipfile import ZipFile

        with ZipFile(b_stream) as zipfile:
            # Assuming there is only one file in the zip or we take the first one
            filename = zipfile.namelist()[0]
            with zipfile.open(filename) as z_f:
                # TextIOWrapper to decode
                import io

                stream = io.TextIOWrapper(z_f, encoding="utf-8-sig")
                return import_from_csv(stream, db, limit)


def import_from_csv(csv_stream: TextIO, db: AozoraDB, limit: int = 0) -> tuple[str | None, list[dict]]:
    """Import books, persons, and contributors from a CSV file."""
    csv_obj = DictReader(csv_stream, fieldnames=FIELD_NAMES)

    next(csv_obj)  # skip the first row (header in Japanese usually, but we forced fieldnames)

    # We need to skip the ACTUAL header row of the CSV if fieldnames are provided to DictReader
    # The Aozora CSV usually has a header row.
    # 'next(csv_obj)' consumes the first data row if FIELD_NAMES matches the header?
    # No, DictReader consumes the first row as keys if fieldnames is None.
    # If fieldnames IS provided, the first row is read as data.
    # So we must manually skip the header row.

    # Watermark logic
    watermark = db.get_watermark()
    max_last_modified = watermark

    # Maps book_id -> {author_name, author_id} for role-0 contributors
    author_map: dict[str, dict] = {}
    # Maps book_id -> {author_name, author_id} for first contributor seen (fallback)
    first_contributor_map: dict[str, dict] = {}

    # Algolia records accumulated during this run
    algolia_books: dict[str, dict] = {}
    algolia_persons: dict[str, dict] = {}

    # Book records for changed books (used by the text/HTML pipeline)
    changed_book_data: dict[str, dict] = {}

    count = 0
    for row in csv_obj:
        if limit > 0 and count >= limit:
            break

        try:
            row_last_modified = _parse_date(row["last_modified"])
            row_release_date = _parse_date(row["release_date"])
            
            # Use the later of last_modified and release_date for watermark
            relevant_date = row_last_modified
            if row_release_date and (not relevant_date or row_release_date > relevant_date):
                relevant_date = row_release_date

            if relevant_date and (not max_last_modified or relevant_date > max_last_modified):
                max_last_modified = relevant_date

            # Always upsert every row into the DB so JSON files contain the full dataset.
            # Only accumulate Algolia records for rows that are new/changed since the watermark.
            is_changed = not watermark or not relevant_date or relevant_date > watermark
            book_data = _process_row(
                row,
                db,
                author_map,
                first_contributor_map,
                algolia_books if is_changed else {},
                algolia_persons if is_changed else {},
            )
            if is_changed:
                # Collect once per book_id (multiple rows share the same book when there
                # are several contributors; we only need the book record once).
                book_id = row["book_id"]
                if book_id not in changed_book_data:
                    changed_book_data[book_id] = book_data
            count += 1

        except Exception as e:
            logger.error(f"Error processing row {row}: {e}")
            # continue or raise? raise for now to debug
            raise

    # Commit main batch (books, persons, contributors)
    db.commit()

    # Second pass: write author_name / author_id onto book documents
    for book_id in first_contributor_map:
        data = author_map.get(book_id) or first_contributor_map[book_id]
        db.update_book_author(book_id, data)
        if book_id in algolia_books:
            algolia_books[book_id].update(data)

    db.commit()

    _sync_algolia(algolia_books, algolia_persons)

    # Return the new watermark and the list of changed book records.
    # The caller saves the watermark after flushing JSON files.
    return max_last_modified, list(changed_book_data.values())


def _sync_algolia(algolia_books: dict, algolia_persons: dict) -> None:
    """Index changed records to Algolia. Skipped if env vars are not set."""
    if not algolia_books and not algolia_persons:
        return
    try:
        from ..algolia.indexer import AlgoliaIndexer

        indexer = AlgoliaIndexer()
        indexer.index_books(list(algolia_books.values()))
        indexer.index_persons(list(algolia_persons.values()))
    except KeyError:
        logger.info("ALGOLIA_APP_ID/ALGOLIA_ADMIN_KEY not set — skipping Algolia indexing.")
