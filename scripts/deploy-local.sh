#!/usr/bin/env bash
# First-time (or manual) deploy of Aozora Pages from your local machine.
# Runs the full pipeline locally so that the initial Cloudflare Pages upload
# (which transfers ~750 MB) comes from your connection rather than GCP.
#
# Prerequisites:
#   - uv installed and `uv sync` already run
#   - Node.js LTS installed
#   - wrangler installed: npm install -g wrangler
#   - All required env vars set (see below), e.g. via a .env file:
#
#       export R2_ACCOUNT_ID=...
#       export R2_ACCESS_KEY_ID=...
#       export R2_SECRET_ACCESS_KEY=...
#       export R2_BUCKET_NAME=...
#       export ALGOLIA_APP_ID=...
#       export ALGOLIA_ADMIN_KEY=...
#       export PUBLIC_ALGOLIA_SEARCH_KEY=...
#       export CLOUDFLARE_API_TOKEN=...
#       export CLOUDFLARE_ACCOUNT_ID=...

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ASTRO_DIR="${ASTRO_DIR:-$REPO_ROOT/astro}"

if [[ ! -d "$ASTRO_DIR" ]]; then
  echo "ERROR: Astro project not found at: $ASTRO_DIR"
  exit 1
fi

ASTRO_DIR="$(cd "$ASTRO_DIR" && pwd)"
DATA_DIR="$ASTRO_DIR/data"

echo "==> Repo root:  $REPO_ROOT"
echo "==> Astro dir:  $ASTRO_DIR"
echo "==> Data dir:   $DATA_DIR"
echo ""

# ── Step 1: Python import ──────────────────────────────────────────────────
echo "==> [1/3] Running Python import..."
cd "$REPO_ROOT"
DATA_DIR="$DATA_DIR" uv run python -m aozora_data.importer.main
echo "    JSON files written to $DATA_DIR"
echo ""

# ── Step 2: Astro build ────────────────────────────────────────────────────
echo "==> [2/3] Building Astro site..."
cd "$ASTRO_DIR"
npm ci --silent
npm run build
echo "    Static site built to $ASTRO_DIR/dist"
echo ""

# ── Step 3: Deploy to Cloudflare Pages ────────────────────────────────────
echo "==> [3/3] Deploying to Cloudflare Pages..."
wrangler pages deploy dist/ --project-name=aozora-pages
echo ""
echo "    Done. Subsequent deploys will be incremental (only changed files)."
