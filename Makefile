PROJECT_ID ?= $(shell gcloud config get-value project)
REGION ?= asia-northeast1
COMMIT_SHA := $(shell git rev-parse --short HEAD)
ARTIFACT_REGISTRY = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/aozora/importer

.PHONY: build run push-image submit

# Build the Docker image locally (note: use push-image on Apple Silicon)
build:
	docker build -t aozora-importer:latest .

# Run the pipeline locally (without Docker) via deploy-local.sh
run:
	./scripts/deploy-local.sh

# Build and push the image only (use this for initial setup before the Cloud Run Job exists)
push-image:
	gcloud builds submit --tag $(ARTIFACT_REGISTRY):latest .

# Submit the full CI/CD pipeline (build + push + update Cloud Run Job)
submit:
	gcloud builds submit --config cloudbuild.yaml \
		--substitutions=_REGION=$(REGION),COMMIT_SHA=$(COMMIT_SHA) .
