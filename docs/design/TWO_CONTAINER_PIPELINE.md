# Design: Two-Container Pipeline Split

**Status:** Implemented
**Date:** 2026-03-15
**Context:** The monolithic container bundled Python (importer + converters) and
Node.js (Astro build + wrangler), producing a 1.43 GB image. Splitting into two
single-runtime containers reduces each image significantly and separates concerns cleanly.

---

## 1. Current State (before this change)

One Cloud Run Job (`aozora-importer`), one 1.43 GB image:

```
Cloud Scheduler ──► Cloud Run Job (Python + Node.js, 1.43 GB)
                      ├── Python: CSV import → JSON files (local /astro/data/)
                      ├── Python: Algolia sync
                      ├── Python: watermark → R2
                      ├── Node.js: npx astro build
                      └── Node.js: npx wrangler pages deploy
```

---

## 2. Target State

Two Cloud Run Jobs, each with a single runtime:

```
Cloud Scheduler ──► Job 1: aozora-python (300 MB)
                      ├── CSV import → books.json / persons.json / contributors.json
                      ├── Upload JSON files → R2 (data/*)
                      ├── Algolia sync
                      ├── Watermark → R2
                      └── Trigger Job 2 via Cloud Run Jobs API
                              │
                              ▼
                    Job 2: aozora-node (884 MB)
                      ├── Download JSON files ← R2 (data/*)
                      ├── npx astro build
                      └── npx wrangler pages deploy
```

---

## 3. Container Definitions

### 3.1 `aozora-python` (`Dockerfile.python`)

Multi-stage build: uv installs the venv in the builder stage; the final image
copies only the `.venv` directory, excluding the 46 MB uv binary.

```dockerfile
FROM python:3.13-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-dev --no-cache

# ── Final image ───────────────────────────────────────────────────────────────
FROM python:3.13-slim

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv

COPY aozora_data/__init__.py ./aozora_data/__init__.py
COPY aozora_data/db          ./aozora_data/db
COPY aozora_data/importer    ./aozora_data/importer
COPY aozora_data/algolia     ./aozora_data/algolia

ENV PATH="/app/.venv/bin:$PATH"
ENV DATA_DIR=/astro/data

CMD ["python", "-m", "aozora_data.importer.main"]
```

No Node.js. Actual size: **300 MB** (vs 1.43 GB monolithic).

### 3.2 `aozora-node` (`Dockerfile.node`)

Multi-stage build: npm installs node_modules in the builder stage; the final
image copies only `node_modules`, excluding the ~119 MB npm cache.

```dockerfile
FROM node:lts-slim AS builder

WORKDIR /astro
COPY astro/package.json astro/package-lock.json ./
RUN npm ci

# ── Final image ───────────────────────────────────────────────────────────────
FROM node:lts-slim

WORKDIR /astro

COPY --from=builder /astro/node_modules ./node_modules
COPY astro .

ENV DATA_DIR=/astro/data

CMD ["/bin/sh", "-c", "node scripts/fetch-data.mjs && npx astro build && npx wrangler pages deploy dist/ --project-name=aozora-pages"]
```

No Python. `fetch-data.mjs` downloads the three JSON files from R2 before the
Astro build starts. Actual size: **884 MB** (vs 1.11 GB single-stage).

---

## 4. Code Changes

### 4.1 `aozora_data/db/json_backend.py` — `upload_json_to_r2()`

Uploads `books.json`, `persons.json`, `contributors.json` to R2 under `data/`:

```python
def upload_json_to_r2(self, output_dir: str | Path) -> None:
    if not R2_BUCKET_NAME:
        logger.info("R2 not configured — skipping JSON upload")
        return
    out = Path(output_dir)
    s3 = _r2_client()
    for name in ("books.json", "persons.json", "contributors.json"):
        s3.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=f"data/{name}",
            Body=(out / name).read_bytes(),
            ContentType="application/json",
        )
        logger.info("Uploaded data/%s to R2", name)
```

### 4.2 `aozora_data/importer/main.py` — R2 upload + trigger Job 2

```python
def main():
    db = AozoraJSON()
    if CSV_URL:
        max_last_modified, changed_books = import_from_csv_url(CSV_URL, db)
        db.flush(DATA_DIR)
        db.upload_json_to_r2(DATA_DIR)   # push JSON to R2 for aozora-node
        if max_last_modified:
            db.save_watermark(max_last_modified)
        logger.info("Changed books: %d", len(changed_books))
    trigger_node_job()
```

**`trigger_node_job()`** — calls the Cloud Run Jobs API:

```python
import google.auth
import google.auth.transport.requests
import requests as http_requests

GCP_PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "")
GCP_REGION     = os.environ.get("GCP_REGION", "asia-northeast1")
NODE_JOB_NAME  = os.environ.get("NODE_JOB_NAME", "aozora-node")

def trigger_node_job() -> None:
    if not NODE_JOB_NAME or not GCP_PROJECT_ID:
        logger.info("NODE_JOB_NAME or GOOGLE_CLOUD_PROJECT not set — skipping")
        return
    credentials, _ = google.auth.default()
    credentials.refresh(google.auth.transport.requests.Request())
    url = (
        f"https://run.googleapis.com/v2/projects/{GCP_PROJECT_ID}"
        f"/locations/{GCP_REGION}/jobs/{NODE_JOB_NAME}:run"
    )
    resp = http_requests.post(
        url, headers={"Authorization": f"Bearer {credentials.token}"}
    )
    resp.raise_for_status()
    logger.info("Triggered Cloud Run Job %s", NODE_JOB_NAME)
```

Requires `google-auth>=2.0` added to `pyproject.toml`.

### 4.3 New file: `astro/scripts/fetch-data.mjs`

Downloads the three JSON files from R2 into `DATA_DIR` before `astro build`:

```javascript
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createWriteStream, mkdirSync } from "fs";
import { pipeline } from "stream/promises";

const s3 = new S3Client({
  endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
  region: "auto",
});

const dataDir = process.env.DATA_DIR ?? "/astro/data";
mkdirSync(dataDir, { recursive: true });

for (const name of ["books.json", "persons.json", "contributors.json"]) {
  const { Body } = await s3.send(
    new GetObjectCommand({ Bucket: required("R2_BUCKET_NAME"), Key: `data/${name}` })
  );
  await pipeline(Body, createWriteStream(`${dataDir}/${name}`));
}
```

`@aws-sdk/client-s3` is added as an explicit devDependency in `astro/package.json`.

---

## 5. Infrastructure Changes

### 5.1 Artifact Registry

| Image | Path |
|---|---|
| Python job | `asia-northeast1-docker.pkg.dev/$PROJECT_ID/aozora/python:$SHA` |
| Node.js job | `asia-northeast1-docker.pkg.dev/$PROJECT_ID/aozora/node:$SHA` |

### 5.2 Cloud Run Jobs

| Job | Image | CPU | Memory | Timeout |
|---|---|---|---|---|
| `aozora-python` | `aozora/python:latest` | 2 | 2 Gi | 900 s |
| `aozora-node` | `aozora/node:latest` | 2 | 4 Gi | 600 s |

Create commands (one-time initial setup):

```bash
gcloud run jobs create aozora-python \
  --image asia-northeast1-docker.pkg.dev/$PROJECT_ID/aozora/python:latest \
  --region asia-northeast1 --cpu 2 --memory 2Gi \
  --task-timeout 900s --max-retries 1 \
  --set-env-vars R2_BUCKET_NAME=aozora,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GCP_REGION=asia-northeast1,NODE_JOB_NAME=aozora-node \
  --set-secrets R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,ALGOLIA_APP_ID=ALGOLIA_APP_ID:latest,ALGOLIA_ADMIN_KEY=ALGOLIA_ADMIN_KEY:latest,PUBLIC_ALGOLIA_APP_ID=ALGOLIA_APP_ID:latest,PUBLIC_ALGOLIA_SEARCH_KEY=ALGOLIA_SEARCH_KEY:latest

gcloud run jobs create aozora-node \
  --image asia-northeast1-docker.pkg.dev/$PROJECT_ID/aozora/node:latest \
  --region asia-northeast1 --cpu 2 --memory 4Gi \
  --task-timeout 600s --max-retries 1 \
  --set-env-vars R2_BUCKET_NAME=aozora,CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
  --set-secrets R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,PUBLIC_ALGOLIA_APP_ID=ALGOLIA_APP_ID:latest,PUBLIC_ALGOLIA_SEARCH_KEY=ALGOLIA_SEARCH_KEY:latest,CLOUDFLARE_API_TOKEN=CLOUDFLARE_API_TOKEN:latest
```

### 5.3 Cloud Scheduler

No change — still triggers `aozora-python` daily. `aozora-python` triggers
`aozora-node` programmatically at the end of its run.

### 5.4 Service Account

`aozora-python`'s service account needs one additional IAM role:

```
roles/run.invoker   (on the aozora-node job, or project-wide)
```

### 5.5 `cloudbuild.yaml`

Six steps (build + push + update per image). Uses `${_COMMIT_SHA}` as a
user-defined substitution so manual `make submit` can pass the local git SHA.
The Cloud Build trigger should define `_COMMIT_SHA = $COMMIT_SHA`.

```yaml
substitutions:
  _REGION: asia-northeast1
  _R2_BUCKET_NAME: aozora
  _CLOUDFLARE_ACCOUNT_ID: ''   # set in Cloud Build trigger substitutions
  _COMMIT_SHA: ''              # set via trigger or --substitutions in manual submit
```

### 5.6 `cloudbuild.single.yaml`

Single-image build config used by `make push-python` / `make push-node`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-f', '${_DOCKERFILE}', '-t', '${_IMAGE}', '.']
images:
  - '${_IMAGE}'
```

### 5.7 Per-Dockerfile build contexts

Each `make push-*` target passes `--ignore-file` to reduce the archive sent to
Cloud Build:

| Target | Ignore file | Excluded |
|---|---|---|
| `push-python` | `Dockerfile.python.dockerignore` | `astro/` |
| `push-node` | `Dockerfile.node.dockerignore` | `aozora_data/`, `pyproject.toml`, `uv.lock` |

**Important:** Use `/scripts/` (leading slash) in ignore files to anchor the
pattern to the build context root. Without the slash, `scripts/` matches any
subdirectory named `scripts` at any depth — which would accidentally exclude
`astro/scripts/fetch-data.mjs`.

### 5.8 Environment Variables

**`aozora-python` job:**

| Variable | Source |
|---|---|
| `R2_ACCOUNT_ID` | Secret Manager |
| `R2_ACCESS_KEY_ID` | Secret Manager |
| `R2_SECRET_ACCESS_KEY` | Secret Manager |
| `R2_BUCKET_NAME` | Env var |
| `ALGOLIA_APP_ID` | Secret Manager |
| `ALGOLIA_ADMIN_KEY` | Secret Manager |
| `GOOGLE_CLOUD_PROJECT` | Env var (used by `trigger_node_job()`) |
| `GCP_REGION` | Env var (default `asia-northeast1`) |
| `NODE_JOB_NAME` | Env var (default `aozora-node`) |

**`aozora-node` job:**

| Variable | Source |
|---|---|
| `R2_ACCOUNT_ID` | Secret Manager |
| `R2_ACCESS_KEY_ID` | Secret Manager |
| `R2_SECRET_ACCESS_KEY` | Secret Manager |
| `R2_BUCKET_NAME` | Env var |
| `PUBLIC_ALGOLIA_APP_ID` | Secret Manager (for Astro build) |
| `PUBLIC_ALGOLIA_SEARCH_KEY` | Secret Manager (for Astro build) |
| `CLOUDFLARE_API_TOKEN` | Secret Manager |
| `CLOUDFLARE_ACCOUNT_ID` | Env var |

---

## 6. Data Flow

```
Cloud Scheduler
  └──► aozora-python
         ├── fetch CSV → parse
         ├── write /app/data/{books,persons,contributors}.json (local)
         ├── PUT R2: data/{books,persons,contributors}.json
         ├── Algolia sync
         ├── PUT R2: watermark.json
         └── POST Cloud Run API → trigger aozora-node
                └──► aozora-node
                       ├── GET R2: data/{books,persons,contributors}.json → /astro/data/
                       ├── npx astro build  (Vite reads /astro/data/*.json at build time)
                       └── npx wrangler pages deploy dist/
```

---

## 7. Trade-offs

| Concern | Impact |
|---|---|
| Total image storage | 300 MB + 884 MB = 1.18 GB vs 1.43 GB monolithic |
| Individual image sizes | Python image pulls in seconds (300 MB) |
| Build cache | Multi-stage excludes uv binary (−46 MB) and npm cache (−119 MB) |
| Latency | ~1–2 min added (Job 2 cold start + R2 download) |
| Failure isolation | If Astro build fails, import + R2 uploads are already committed |
| Operational complexity | Two jobs, two images, one IAM binding to maintain |
| `google-auth` dependency | New Python dep (~5 MB) |
