# executor-claude-sdk service build configuration

EXECUTOR_CLAUDE_SDK_SERVICE_NAME := executor-claude-sdk
EXECUTOR_CLAUDE_SDK_SERVICE_DIR := services/$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)
EXECUTOR_CLAUDE_SDK_OUT := $(OUT)/$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)

# Service-specific variables
CLAUDE_SDK_IMAGE := executor-claude-sdk
CLAUDE_SDK_TAG ?= latest
CLAUDE_SDK_NAMESPACE ?= default

# Pre-calculate all stamp paths
EXECUTOR_CLAUDE_SDK_STAMP_DEPS := $(EXECUTOR_CLAUDE_SDK_OUT)/stamp-deps
EXECUTOR_CLAUDE_SDK_STAMP_BUILD := $(EXECUTOR_CLAUDE_SDK_OUT)/stamp-build
EXECUTOR_CLAUDE_SDK_STAMP_INSTALL := $(EXECUTOR_CLAUDE_SDK_OUT)/stamp-install
EXECUTOR_CLAUDE_SDK_STAMP_TEST := $(EXECUTOR_CLAUDE_SDK_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_OUT)
# Clean up Python artifacts
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/dist
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/htmlcov
CLEAN_TARGETS += $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context

# Define phony targets
.PHONY: $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-build $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-install $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-uninstall $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev-deps $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-test

# Dependencies
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-deps: $(EXECUTOR_CLAUDE_SDK_STAMP_DEPS)
$(EXECUTOR_CLAUDE_SDK_STAMP_DEPS): $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	# Copy wheel to service directory for Docker build
	cp $(ARK_SDK_WHL) $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/
	# Update pyproject.toml to use local wheel file
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && \
	sed -i.bak 's|path = "../../lib/ark-sdk/gen_sdk/overlay/python"|path = "./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl"|' pyproject.toml && \
	sed -i.bak 's|editable = true||' pyproject.toml && \
	rm -f pyproject.toml.bak && \
	uv remove ark_sdk || true && \
	uv add ./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl && \
	rm -f uv.lock && uv sync
	@touch $@

# Build target
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-build: $(EXECUTOR_CLAUDE_SDK_STAMP_BUILD) # HELP: Build Claude SDK executor engine Docker image
$(EXECUTOR_CLAUDE_SDK_STAMP_BUILD): $(EXECUTOR_CLAUDE_SDK_STAMP_DEPS)
	@mkdir -p $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context
	cp $(ARK_SDK_WHL) $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context/
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && docker build -t $(CLAUDE_SDK_IMAGE):$(CLAUDE_SDK_TAG) .
	@rm -rf $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context
	@touch $@

# Install target
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-install: $(EXECUTOR_CLAUDE_SDK_STAMP_INSTALL) # HELP: Deploy Claude SDK executor engine to cluster
$(EXECUTOR_CLAUDE_SDK_STAMP_INSTALL): $(EXECUTOR_CLAUDE_SDK_STAMP_BUILD)
	@mkdir -p $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context
	cp $(ARK_SDK_WHL) $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context/
	./scripts/build-and-push.sh -i $(CLAUDE_SDK_IMAGE) -t $(CLAUDE_SDK_TAG) -f $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/Dockerfile -c $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)
	@rm -rf $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR)/build-context
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && helm upgrade --install executor-claude-sdk ./chart -n $(CLAUDE_SDK_NAMESPACE) --create-namespace --set image.repository=$(CLAUDE_SDK_IMAGE) --set image.tag=$(CLAUDE_SDK_TAG)
	@touch $@

# Dev target dependencies - prepare local environment  
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev-deps: $(ARK_SDK_WHL)
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && \
	uv remove ark_sdk || true && \
	uv add $(ARK_SDK_WHL) && \
	uv sync

# Dev target
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev: $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev-deps # HELP: Run Claude SDK executor locally for development
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && \
	uv run python -m claude_sdk_executor

# Uninstall target
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-uninstall: # HELP: Remove Claude SDK executor engine from cluster
	helm uninstall executor-claude-sdk -n $(CLAUDE_SDK_NAMESPACE) --ignore-not-found
	rm -f $(EXECUTOR_CLAUDE_SDK_STAMP_INSTALL)

# Test target
$(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-test: $(EXECUTOR_CLAUDE_SDK_STAMP_TEST) # HELP: Run tests for Claude SDK executor engine
$(EXECUTOR_CLAUDE_SDK_STAMP_TEST): $(EXECUTOR_CLAUDE_SDK_SERVICE_NAME)-dev-deps | $(OUT)
	@mkdir -p $(dir $@)
	cd $(EXECUTOR_CLAUDE_SDK_SERVICE_DIR) && uv run pytest tests/ -v --tb=short
	@touch $@
