# Aozora Bunko Viewer

A web application to browse, search, and read Aozora Bunko works, built with Next.js and Cloud Firestore.

## Prerequisites

- Node.js 18+
- Google Cloud Project with Firestore enabled containing Aozora Bunko data.

## Getting Started

### 1. Authentication
This application uses `firebase-admin` which requires Google Cloud credentials.

**Local Development:**
Authenticate using the gcloud CLI to set up Application Default Credentials (ADC):

```bash
gcloud auth application-default login
```

Ensure your authenticated account has `Cloud Datastore User` (or Viewer) permissions on the target GCP project.

### 2. Installation

Navigate to the `web` directory and install dependencies:

```bash
cd web
npm install
```

### 3. Running Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deployment

The application is containerized for Google Cloud Run.

```bash
# Set your project ID
export PROJECT_ID=your-project-id

# Build and Submit to Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/aozora-web

# Deploy to Cloud Run
gcloud run deploy aozora-web \
  --image gcr.io/$PROJECT_ID/aozora-web \
  --platform managed \
  --region asia-northeast1 \
  --allow-unauthenticated
```
