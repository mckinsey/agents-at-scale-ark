include ../../helpers.mk

# Local langfuse convenience commands
.DEFAULT_GOAL := help

# Service variables
LANGFUSE_NAMESPACE ?= telemetry
LANGFUSE_PUBLIC_KEY ?= lf_pk_1234567890
LANGFUSE_SECRET_KEY ?= lf_sk_1234567890
LANGFUSE_INTERNAL_ENDPOINT := http://langfuse-web.$(LANGFUSE_NAMESPACE).svc.cluster.local:3000

.PHONY: help dashboard deploy-otel-headers

help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done


deploy-otel-headers: # HELP: Deploy OTEL authentication secrets to all namespaces
	@LANGFUSE_PUBLIC_KEY=$(LANGFUSE_PUBLIC_KEY) \
		LANGFUSE_SECRET_KEY=$(LANGFUSE_SECRET_KEY) \
		LANGFUSE_ENDPOINT=$(LANGFUSE_INTERNAL_ENDPOINT) \
		LANGFUSE_DEPLOYMENT=langfuse-web \
		LANGFUSE_NAMESPACE=$(LANGFUSE_NAMESPACE) \
		./scripts/deploy-otel-headers.sh
