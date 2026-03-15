import logging
import os

import google.auth
import google.auth.transport.requests
import requests as http_requests

from ..db.json_backend import AozoraJSON
from .csv_importer import import_from_csv_url

logger = logging.getLogger(__name__)

CSV_URL = os.environ.get(
    "AOZORA_CSV_URL",
    "https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip",
)
DATA_DIR = os.environ.get("DATA_DIR", "./astro/data")

# Cloud Run Job to trigger after the Python pipeline completes.
# Set NODE_JOB_NAME="" to disable triggering (e.g. in local dev).
GCP_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GCP_REGION = os.environ.get("GCP_REGION", "asia-northeast1")
NODE_JOB_NAME = os.environ.get("NODE_JOB_NAME", "aozora-node")


def trigger_node_job() -> None:
    """Trigger the aozora-node Cloud Run Job via the Cloud Run API."""
    if not NODE_JOB_NAME:
        logger.info("NODE_JOB_NAME not set — skipping node job trigger")
        return
    if not GCP_PROJECT_ID:
        logger.info("GOOGLE_CLOUD_PROJECT not set — skipping node job trigger")
        return

    try:
        credentials, _ = google.auth.default()
        credentials.refresh(google.auth.transport.requests.Request())

        url = (
            f"https://run.googleapis.com/v2/projects/{GCP_PROJECT_ID}"
            f"/locations/{GCP_REGION}/jobs/{NODE_JOB_NAME}:run"
        )
        resp = http_requests.post(
            url,
            headers={"Authorization": f"Bearer {credentials.token}"},
        )
        resp.raise_for_status()
        logger.info("Triggered Cloud Run Job %s", NODE_JOB_NAME)
    except Exception as e:
        logger.error("Failed to trigger node job %s: %s", NODE_JOB_NAME, e)


def main():
    """Import data from CSV, write JSON files, then save the watermark."""
    db = AozoraJSON()
    if CSV_URL:
        # import_from_csv_url returns the max last_modified seen in this run.
        # We flush JSON files first, then save the watermark, so that a crash
        # between flush() and save_watermark() leaves the watermark un-advanced
        # and the next run will safely reprocess the same records.
        max_last_modified, changed_books = import_from_csv_url(CSV_URL, db)
        db.flush(DATA_DIR)
        db.upload_json_to_r2(DATA_DIR)
        if max_last_modified:
            db.save_watermark(max_last_modified)
        logger.info("Changed books: %d", len(changed_books))

    trigger_node_job()


if __name__ == "__main__":
    main()
