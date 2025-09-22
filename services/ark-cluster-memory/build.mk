# ark-cluster-memory service build configuration

ARK_CLUSTER_MEMORY_SERVICE_NAME := ark-cluster-memory
ARK_CLUSTER_MEMORY_SERVICE_DIR := services/$(ARK_CLUSTER_MEMORY_SERVICE_NAME)
ARK_CLUSTER_MEMORY_OUT := $(OUT)/$(ARK_CLUSTER_MEMORY_SERVICE_NAME)

# Service-specific variables
ARK_CLUSTER_MEMORY_IMAGE := ark-cluster-memory
ARK_CLUSTER_MEMORY_TAG ?= latest
ARK_CLUSTER_MEMORY_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_CLUSTER_MEMORY_STAMP_DEPS := $(ARK_CLUSTER_MEMORY_OUT)/stamp-deps
ARK_CLUSTER_MEMORY_STAMP_TEST := $(ARK_CLUSTER_MEMORY_OUT)/stamp-test
ARK_CLUSTER_MEMORY_STAMP_BUILD := $(ARK_CLUSTER_MEMORY_OUT)/stamp-build
ARK_CLUSTER_MEMORY_STAMP_INSTALL := $(ARK_CLUSTER_MEMORY_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_CLUSTER_MEMORY_OUT)
# Clean up Node.js artifacts
CLEAN_TARGETS += $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/node_modules
CLEAN_TARGETS += $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/dist
CLEAN_TARGETS += $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/coverage

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_CLUSTER_MEMORY_STAMP_INSTALL)

# Define phony targets
.PHONY: $(ARK_CLUSTER_MEMORY_SERVICE_NAME)-build $(ARK_CLUSTER_MEMORY_SERVICE_NAME)-install $(ARK_CLUSTER_MEMORY_SERVICE_NAME)-uninstall $(ARK_CLUSTER_MEMORY_SERVICE_NAME)-dev $(ARK_CLUSTER_MEMORY_SERVICE_NAME)-test

# Dependencies
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-deps: $(ARK_CLUSTER_MEMORY_STAMP_DEPS)
$(ARK_CLUSTER_MEMORY_STAMP_DEPS): $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/package.json $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/package-lock.json | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory && npm ci
	@touch $@

# Test target
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-test: $(ARK_CLUSTER_MEMORY_STAMP_TEST)
$(ARK_CLUSTER_MEMORY_STAMP_TEST): $(ARK_CLUSTER_MEMORY_STAMP_DEPS)
	cd $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory && npm run lint && npm run type-check && npm run test
	@touch $@

# Build target
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-build: $(ARK_CLUSTER_MEMORY_STAMP_BUILD) # HELP: Build ARK cluster memory service Docker image
$(ARK_CLUSTER_MEMORY_STAMP_BUILD): $(ARK_CLUSTER_MEMORY_STAMP_DEPS)
	cd $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory && docker build -t $(ARK_CLUSTER_MEMORY_IMAGE):$(ARK_CLUSTER_MEMORY_TAG) .
	@touch $@

# Install target
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-install: $(ARK_CLUSTER_MEMORY_STAMP_INSTALL) # HELP: Deploy ARK cluster memory service to cluster
$(ARK_CLUSTER_MEMORY_STAMP_INSTALL): $(ARK_CLUSTER_MEMORY_STAMP_BUILD)
	./scripts/build-and-push.sh -i $(ARK_CLUSTER_MEMORY_IMAGE) -t $(ARK_CLUSTER_MEMORY_TAG) -f $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory/Dockerfile -c $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory
	helm upgrade --install $(ARK_CLUSTER_MEMORY_SERVICE_NAME) $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/chart \
		--namespace $(ARK_CLUSTER_MEMORY_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(ARK_CLUSTER_MEMORY_IMAGE) \
		--set app.image.tag=$(ARK_CLUSTER_MEMORY_TAG) \
		--wait \
		--timeout=5m
	@touch $@

# Uninstall target
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-uninstall: # HELP: Remove ARK cluster memory service from cluster
	helm uninstall $(ARK_CLUSTER_MEMORY_SERVICE_NAME) --namespace $(ARK_CLUSTER_MEMORY_NAMESPACE) --ignore-not-found
	rm -f $(ARK_CLUSTER_MEMORY_STAMP_INSTALL)

# Dev target
$(ARK_CLUSTER_MEMORY_SERVICE_NAME)-dev: $(ARK_CLUSTER_MEMORY_STAMP_DEPS)
	cd $(ARK_CLUSTER_MEMORY_SERVICE_DIR)/ark-cluster-memory && npm run dev