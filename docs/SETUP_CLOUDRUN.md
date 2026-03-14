# One-time Cloud Run Job setup

Run these commands once before the first Cloud Build CI/CD trigger fires.
After this, `cloudbuild.yaml` handles image updates on every push.

## 1. Create Artifact Registry repository

```bash
gcloud artifacts repositories create aozora \
  --repository-format=docker \
  --location=asia-northeast1
```

## 2. Store secrets in Secret Manager

```bash
# Cloudflare R2
echo -n "$R2_ACCOUNT_ID"       | gcloud secrets create R2_ACCOUNT_ID       --data-file=-
echo -n "$R2_ACCESS_KEY_ID"    | gcloud secrets create R2_ACCESS_KEY_ID    --data-file=-
echo -n "$R2_SECRET_ACCESS_KEY"| gcloud secrets create R2_SECRET_ACCESS_KEY --data-file=-

# Algolia
echo -n "$ALGOLIA_APP_ID"           | gcloud secrets create ALGOLIA_APP_ID           --data-file=-
echo -n "$ALGOLIA_ADMIN_KEY"        | gcloud secrets create ALGOLIA_ADMIN_KEY        --data-file=-
echo -n "$ALGOLIA_SEARCH_KEY"| gcloud secrets create ALGOLIA_SEARCH_KEY --data-file=-

# Cloudflare Pages deploy token
echo -n "$CLOUDFLARE_API_TOKEN"| gcloud secrets create CLOUDFLARE_API_TOKEN --data-file=-
```

## 3. Grant IAM permissions

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
CLOUD_BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"
COMPUTE_SA="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Compute SA: used by Cloud Run Job at runtime to read secrets
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$COMPUTE_SA" \
  --role="roles/secretmanager.secretAccessor"

# Cloud Build: build image, read secrets, update job
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_BUILD_SA" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_BUILD_SA" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$CLOUD_BUILD_SA" \
  --role="roles/run.developer"
```

## 4. Build and push the initial image

Use `gcloud builds submit` so the image is built on Cloud Build's x86_64 machines
(required if you are on Apple Silicon — a locally built ARM image will not run on Cloud Run):

```bash
make push-image
```

## 5. Create or update the Cloud Run Job

If the job does not exist yet, use `create`; if it already exists, use `update`:

```bash
REGION=asia-northeast1
PROJECT_ID=$(gcloud config get-value project)
R2_BUCKET_NAME=aozora                # your R2 bucket name
CLOUDFLARE_ACCOUNT_ID=...            # your Cloudflare account ID

# Use 'create' for a new job, 'update' to reconfigure an existing one
gcloud run jobs update aozora-importer \
  --image $REGION-docker.pkg.dev/$PROJECT_ID/aozora/importer:latest \
  --region $REGION \
  --cpu 2 \
  --memory 4Gi \
  --task-timeout 900s \
  --max-retries 1 \
  --set-env-vars "R2_BUCKET_NAME=$R2_BUCKET_NAME,CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID" \
  --update-secrets "R2_ACCOUNT_ID=R2_ACCOUNT_ID:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,ALGOLIA_APP_ID=ALGOLIA_APP_ID:latest,ALGOLIA_ADMIN_KEY=ALGOLIA_ADMIN_KEY:latest,PUBLIC_ALGOLIA_APP_ID=ALGOLIA_APP_ID:latest,PUBLIC_ALGOLIA_SEARCH_KEY=ALGOLIA_SEARCH_KEY:latest,CLOUDFLARE_API_TOKEN=CLOUDFLARE_API_TOKEN:latest"
```

## 6. Schedule daily runs with Cloud Scheduler

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant Cloud Scheduler permission to trigger the job
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

# Create a daily schedule at 03:00 JST (18:00 UTC)
gcloud scheduler jobs create http aozora-daily-import \
  --location=asia-northeast1 \
  --schedule="0 18 * * *" \
  --uri="https://asia-northeast1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT_ID/jobs/aozora-importer:run" \
  --http-method=POST \
  --oauth-service-account-email="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
```

## 7. First deploy (local)

Run `scripts/deploy-local.sh` from the repo root with all env vars set.
This uploads ~250 MB to Cloudflare from your local machine instead of from GCP.
Subsequent runs (via Cloud Scheduler → Cloud Run Job) upload only changed files
(typically a few MB per day).
