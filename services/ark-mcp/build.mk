# ark-mcp service build configuration

ARK_MCP_SERVICE_NAME := ark-mcp
ARK_MCP_SERVICE_DIR := services/$(ARK_MCP_SERVICE_NAME)
ARK_MCP_SERVICE_SOURCE_DIR := $(ARK_MCP_SERVICE_DIR)/ark-mcp
ARK_MCP_OUT := $(OUT)/$(ARK_MCP_SERVICE_NAME)

# Service-specific variables
ARK_MCP_IMAGE := ark-mcp
ARK_MCP_TAG ?= latest
ARK_MCP_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_MCP_STAMP_DEPS := $(ARK_MCP_OUT)/stamp-deps
ARK_MCP_STAMP_BUILD := $(ARK_MCP_OUT)/stamp-build
ARK_MCP_STAMP_INSTALL := $(ARK_MCP_OUT)/stamp-install
ARK_MCP_STAMP_TEST := $(ARK_MCP_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_MCP_OUT)
# Clean up local out directory that shouldn't exist
CLEAN_TARGETS += $(ARK_MCP_SERVICE_DIR)/out
CLEAN_TARGETS += $(ARK_MCP_SERVICE_DIR)/ark-mcp/out

# Clean up Python artifacts
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/.ruff_cache
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/*.egg-info
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/dist
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/build
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/.coverage
CLEAN_TARGETS += $(ARK_MCP_SERVICE_SOURCE_DIR)/htmlcov

# Define phony targets
.PHONY: $(ARK_MCP_SERVICE_NAME)-build $(ARK_MCP_SERVICE_NAME)-install $(ARK_MCP_SERVICE_NAME)-uninstall $(ARK_MCP_SERVICE_NAME)-dev $(ARK_MCP_SERVICE_NAME)-dev-deps $(ARK_MCP_SERVICE_NAME)-test $(ARK_MCP_SERVICE_NAME)-clean-stamps

# Generate clean-stamps target
$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARK_MCP_SERVICE_NAME)))

# Dependencies
$(ARK_MCP_SERVICE_NAME)-deps: $(ARK_MCP_STAMP_DEPS)
$(ARK_MCP_STAMP_DEPS): $(ARK_MCP_SERVICE_SOURCE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_MCP_SERVICE_SOURCE_DIR) && uv remove ark_sdk || true && \
	uv add $(ARK_SDK_WHL) && \
	rm -f uv.lock && uv sync
	@touch $@

# Build target
$(ARK_MCP_SERVICE_NAME)-build: $(ARK_MCP_STAMP_BUILD) # HELP: Build ark-mcp Docker image
$(ARK_MCP_STAMP_BUILD): $(ARK_MCP_STAMP_DEPS) $(ARK_SDK_WHL)
	@mkdir -p $(ARK_MCP_SERVICE_DIR)/ark-mcp/out
	cp $(ARK_SDK_WHL) $(ARK_MCP_SERVICE_DIR)/ark-mcp/out/
	cd $(ARK_MCP_SERVICE_DIR) && docker build -t $(ARK_MCP_IMAGE):$(ARK_MCP_TAG) .
	@rm -rf $(ARK_MCP_SERVICE_DIR)/ark-mcp/out
	@touch $@

# Install target
$(ARK_MCP_SERVICE_NAME)-install: $(ARK_MCP_STAMP_INSTALL) # HELP: Deploy ark-mcp MCP server to cluster
$(ARK_MCP_STAMP_INSTALL): $(ARK_MCP_STAMP_BUILD)
	@mkdir -p $(ARK_MCP_SERVICE_DIR)/ark-mcp/out
	cp $(ARK_SDK_WHL) $(ARK_MCP_SERVICE_DIR)/ark-mcp/out/
	./scripts/build-and-push.sh -i $(ARK_MCP_IMAGE) -t $(ARK_MCP_TAG) -f $(ARK_MCP_SERVICE_DIR)/Dockerfile -c $(ARK_MCP_SERVICE_DIR)
	@rm -rf $(ARK_MCP_SERVICE_DIR)/ark-mcp/out
	cd $(ARK_MCP_SERVICE_DIR) && helm upgrade --install ark-mcp ./chart -n $(ARK_MCP_NAMESPACE) --create-namespace --set app.image.repository=$(ARK_MCP_IMAGE) --set app.image.tag=$(ARK_MCP_TAG) --set httpRoute.enabled=true
	@touch $@

# Dev target dependencies - prepare local environment  
$(ARK_MCP_SERVICE_NAME)-dev-deps: $(ARK_SDK_WHL)
	cd $(ARK_MCP_SERVICE_SOURCE_DIR) && \
	uv add $(ARK_SDK_WHL) && \
	uv sync

# Dev target
$(ARK_MCP_SERVICE_NAME)-dev: $(ARK_MCP_SERVICE_NAME)-dev-deps # HELP: Run ark-mcp server locally for development
	cd $(ARK_MCP_SERVICE_SOURCE_DIR) && \
	uv run python -m ark_mcp

# Uninstall target
$(ARK_MCP_SERVICE_NAME)-uninstall: # HELP: Remove ark-mcp MCP server from cluster
	helm uninstall ark-mcp -n $(ARK_MCP_NAMESPACE) --ignore-not-found
	rm -f $(ARK_MCP_STAMP_INSTALL)

# Test target
$(ARK_MCP_SERVICE_NAME)-test: $(ARK_MCP_STAMP_TEST) # HELP: Run tests for ark-mcp
$(ARK_MCP_STAMP_TEST): $(ARK_MCP_STAMP_DEPS)
	cd $(ARK_MCP_SERVICE_SOURCE_DIR) && ruff check
	@touch $@