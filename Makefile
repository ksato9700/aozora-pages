PROJECT_ID ?= $(shell gcloud config get-value project)
REGION ?= asia-northeast1
COMMIT_SHA := $(shell git rev-parse --short HEAD)
REGISTRY = $(REGION)-docker.pkg.dev/$(PROJECT_ID)/aozora

PYTHON_IMAGE = aozora-python
NODE_IMAGE   = aozora-node

.PHONY: build build-python build-node run push-python push-node submit

# Build both images locally
build: build-python build-node

# Build the Python container image locally
build-python:
	docker build -f Dockerfile.python -t $(PYTHON_IMAGE):latest .

# Build the Node.js container image locally
build-node:
	docker build -f Dockerfile.node -t $(NODE_IMAGE):latest .

# Run the pipeline locally (without Docker) via deploy-local.sh
run:
	./scripts/deploy-local.sh

# Build and push the Python image only (use for initial setup before Cloud Run Job exists)
push-python:
	gcloud builds submit --config cloudbuild.single.yaml \
		--ignore-file Dockerfile.python.dockerignore \
		--substitutions=_DOCKERFILE=Dockerfile.python,_IMAGE=$(REGISTRY)/python:latest .

# Build and push the Node.js image only
push-node:
	gcloud builds submit --config cloudbuild.single.yaml \
		--ignore-file Dockerfile.node.dockerignore \
		--substitutions=_DOCKERFILE=Dockerfile.node,_IMAGE=$(REGISTRY)/node:latest .

# Submit the full CI/CD pipeline (build + push + update both Cloud Run Jobs)
submit:
	gcloud builds submit --config cloudbuild.yaml \
		--substitutions=_REGION=$(REGION),_COMMIT_SHA=$(COMMIT_SHA) .
