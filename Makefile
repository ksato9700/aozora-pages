PROJECT_ID ?= $(shell gcloud config get-value project)
REGION ?= asia-northeast1
COMMIT_SHA := $(shell git rev-parse --short HEAD)

.PHONY: deploy

deploy:
	gcloud builds submit --config cloudbuild.yaml --project $(PROJECT_ID) --substitutions=COMMIT_SHA=$(COMMIT_SHA)

.PHONY: grant-permission

grant-permission:
	gcloud run services add-iam-policy-binding aozora-pages-web \
		--region $(REGION) \
		--member="allUsers" \
		--role="roles/run.invoker" \
		--project $(PROJECT_ID)
