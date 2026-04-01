# Workspace Mandates

- **ID Padding**: Always use 6-digit zero-padded strings for `book_id` and `person_id` (e.g., `"057671"`) in all JSON exports and R2 filenames. The Astro frontend and Cloudflare Reader expect this format for routing and file fetching.
- **Change Detection**: When importing Aozora CSV data, use the later of `release_date` and `last_modified` to determine if a book is "new" or "changed" relative to the watermark.
- **Pipeline Reliability**: Always save the R2 watermark *after* the HTML conversion pipeline completes to ensure no books are skipped if a conversion fails.
- **Logging**: Ensure `logging.basicConfig(level=logging.INFO)` is called at the start of any Cloud Run entry point for visibility in GCP logs.
