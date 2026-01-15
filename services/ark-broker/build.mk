# ark-broker service build configuration

ARK_BROKER_SERVICE_NAME := ark-broker
ARK_BROKER_SERVICE_DIR := services/$(ARK_BROKER_SERVICE_NAME)
ARK_BROKER_OUT := $(OUT)/$(ARK_BROKER_SERVICE_NAME)

# Service-specific variables
ARK_BROKER_IMAGE := ark-broker
ARK_BROKER_TAG ?= latest
ARK_BROKER_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_BROKER_STAMP_DEPS := $(ARK_BROKER_OUT)/stamp-deps
ARK_BROKER_STAMP_TEST := $(ARK_BROKER_OUT)/stamp-test
ARK_BROKER_STAMP_BUILD := $(ARK_BROKER_OUT)/stamp-build
ARK_BROKER_STAMP_INSTALL := $(ARK_BROKER_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_BROKER_OUT)
# Clean up Node.js artifacts
CLEAN_TARGETS += $(ARK_BROKER_SERVICE_DIR)/ark-broker/node_modules
CLEAN_TARGETS += $(ARK_BROKER_SERVICE_DIR)/ark-broker/dist
CLEAN_TARGETS += $(ARK_BROKER_SERVICE_DIR)/ark-broker/coverage

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_BROKER_STAMP_INSTALL)

# Define phony targets
.PHONY: $(ARK_BROKER_SERVICE_NAME)-build $(ARK_BROKER_SERVICE_NAME)-install $(ARK_BROKER_SERVICE_NAME)-uninstall $(ARK_BROKER_SERVICE_NAME)-dev $(ARK_BROKER_SERVICE_NAME)-test

# Dependencies
$(ARK_BROKER_SERVICE_NAME)-deps: $(ARK_BROKER_STAMP_DEPS)
$(ARK_BROKER_STAMP_DEPS): $(ARK_BROKER_SERVICE_DIR)/ark-broker/package.json $(ARK_BROKER_SERVICE_DIR)/ark-broker/package-lock.json | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_BROKER_SERVICE_DIR)/ark-broker && npm ci
	@touch $@

# Test target
$(ARK_BROKER_SERVICE_NAME)-test: $(ARK_BROKER_STAMP_TEST)
$(ARK_BROKER_STAMP_TEST): $(ARK_BROKER_STAMP_DEPS)
	cd $(ARK_BROKER_SERVICE_DIR)/ark-broker && npm run lint && npm run type-check && npm run test
	@touch $@

# Build target
$(ARK_BROKER_SERVICE_NAME)-build: $(ARK_BROKER_STAMP_BUILD) # HELP: Build ARK broker service Docker image
$(ARK_BROKER_STAMP_BUILD): $(ARK_BROKER_STAMP_DEPS)
	cd $(ARK_BROKER_SERVICE_DIR)/ark-broker && docker build -t $(ARK_BROKER_IMAGE):$(ARK_BROKER_TAG) .
	@touch $@

# Install target
$(ARK_BROKER_SERVICE_NAME)-install: $(ARK_BROKER_STAMP_INSTALL) # HELP: Deploy ARK broker service to cluster
$(ARK_BROKER_STAMP_INSTALL): $(ARK_BROKER_STAMP_BUILD)
	./scripts/build-and-push.sh -i $(ARK_BROKER_IMAGE) -t $(ARK_BROKER_TAG) -f $(ARK_BROKER_SERVICE_DIR)/ark-broker/Dockerfile -c $(ARK_BROKER_SERVICE_DIR)/ark-broker
	helm upgrade --install $(ARK_BROKER_SERVICE_NAME) $(ARK_BROKER_SERVICE_DIR)/chart \
		--namespace $(ARK_BROKER_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(ARK_BROKER_IMAGE) \
		--set app.image.tag=$(ARK_BROKER_TAG) \
		--wait \
		--timeout=5m
	@touch $@

# Uninstall target
$(ARK_BROKER_SERVICE_NAME)-uninstall: # HELP: Remove ARK broker service from cluster
	helm uninstall $(ARK_BROKER_SERVICE_NAME) --namespace $(ARK_BROKER_NAMESPACE) --ignore-not-found
	rm -f $(ARK_BROKER_STAMP_INSTALL)

# Dev target
$(ARK_BROKER_SERVICE_NAME)-dev: $(ARK_BROKER_STAMP_DEPS)
	cd $(ARK_BROKER_SERVICE_DIR)/ark-broker && npm run dev