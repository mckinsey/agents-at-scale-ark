# ark-cli service build configuration

ARK_CLI_SERVICE_NAME := ark-cli
ARK_CLI_SERVICE_DIR := tools/$(ARK_CLI_SERVICE_NAME)
ARK_CLI_OUT := $(OUT)/$(ARK_CLI_SERVICE_NAME)

# Service-specific variables
ARK_CLI_DIST := $(ARK_CLI_SERVICE_DIR)/dist
ARK_CLI_IMAGE := agents-at-scale/ark
ARK_CLI_TAG ?= alpine

# Pre-calculate all stamp paths
ARK_CLI_STAMP_DEPS := $(ARK_CLI_OUT)/stamp-deps
ARK_CLI_STAMP_BUILD := $(ARK_CLI_OUT)/stamp-build
ARK_CLI_STAMP_DOCKER := $(ARK_CLI_OUT)/stamp-docker
ARK_CLI_STAMP_INSTALL := $(ARK_CLI_OUT)/stamp-install
ARK_CLI_STAMP_TEST := $(ARK_CLI_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_CLI_OUT)
# Clean up Node.js artifacts
CLEAN_TARGETS += $(ARK_CLI_SERVICE_DIR)/node_modules
CLEAN_TARGETS += $(ARK_CLI_SERVICE_DIR)/dist
CLEAN_TARGETS += $(ARK_CLI_SERVICE_DIR)/coverage

# Define phony targets
.PHONY: $(ARK_CLI_SERVICE_NAME)-build $(ARK_CLI_SERVICE_NAME)-docker $(ARK_CLI_SERVICE_NAME)-install $(ARK_CLI_SERVICE_NAME)-dev $(ARK_CLI_SERVICE_NAME)-test $(ARK_CLI_SERVICE_NAME)-uninstall

# Dependencies
$(ARK_CLI_SERVICE_NAME)-deps: $(ARK_CLI_STAMP_DEPS)
$(ARK_CLI_STAMP_DEPS): $(ARK_CLI_SERVICE_DIR)/package.json | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_CLI_SERVICE_DIR) && npm install
	@touch $@

# Build target (TypeScript compilation)
$(ARK_CLI_SERVICE_NAME)-build: $(ARK_CLI_STAMP_BUILD) # HELP: Build ARK CLI tool
$(ARK_CLI_STAMP_BUILD): $(ARK_CLI_STAMP_DEPS)
	cd $(ARK_CLI_SERVICE_DIR) && npm run build
	@touch $@

# Docker build target
$(ARK_CLI_SERVICE_NAME)-docker: $(ARK_CLI_STAMP_DOCKER) # HELP: Build ARK CLI tool Docker image
$(ARK_CLI_STAMP_DOCKER): $(ARK_CLI_SERVICE_DIR)/Dockerfile $(ARK_CLI_SERVICE_DIR)/package.json | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_CLI_SERVICE_DIR) && docker build -t $(ARK_CLI_IMAGE):$(ARK_CLI_TAG) .
	@touch $@

# Install target (installs globally on local machine)
$(ARK_CLI_SERVICE_NAME)-install: $(ARK_CLI_STAMP_INSTALL) # HELP: Install ARK CLI tool globally
$(ARK_CLI_STAMP_INSTALL): $(ARK_CLI_STAMP_BUILD)
	cd $(ARK_CLI_SERVICE_DIR) && npm link
	@touch $@

# Dev target
$(ARK_CLI_SERVICE_NAME)-dev: $(ARK_CLI_STAMP_DEPS)
	cd $(ARK_CLI_SERVICE_DIR) && npm run dev

# Test target
$(ARK_CLI_SERVICE_NAME)-test: $(ARK_CLI_STAMP_TEST) # HELP: Run tests for ARK CLI tool
$(ARK_CLI_STAMP_TEST): $(ARK_CLI_STAMP_DEPS) | $(OUT)
	@mkdir -p $(dir $@)
	@printf '\033[0;31m⚠️  NO TESTS ARE DEFINED for $(ARK_CLI_SERVICE_NAME)\033[0m\n'
	@touch $@

# Uninstall target
$(ARK_CLI_SERVICE_NAME)-uninstall: # HELP: Uninstall ARK CLI tool
	cd $(ARK_CLI_SERVICE_DIR) && npm unlink --silent 2>/dev/null || true
	@rm -f $(ARK_CLI_STAMP_INSTALL)
