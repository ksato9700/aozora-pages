import os

from ..db.json_backend import AozoraJSON
from .csv_importer import import_from_csv_url

CSV_URL = os.environ.get(
    "AOZORA_CSV_URL",
    "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip",
)
DATA_DIR = os.environ.get("DATA_DIR", "./astro/data")


def main():
    """Import data from CSV, write JSON files, then save the watermark."""
    db = AozoraJSON()
    if CSV_URL:
        # import_from_csv_url returns the max last_modified seen in this run.
        # We flush JSON files first, then save the watermark, so that a crash
        # between flush() and save_watermark() leaves the watermark un-advanced
        # and the next run will safely reprocess the same records.
        max_last_modified = import_from_csv_url(CSV_URL, db)
        db.flush(DATA_DIR)
        if max_last_modified:
            db.save_watermark(max_last_modified)


if __name__ == "__main__":
    main()
