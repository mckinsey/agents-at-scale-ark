# executor-langchain service build configuration

EXECUTOR_LANGCHAIN_SERVICE_NAME := executor-langchain
EXECUTOR_LANGCHAIN_SERVICE_DIR := services/$(EXECUTOR_LANGCHAIN_SERVICE_NAME)
EXECUTOR_LANGCHAIN_OUT := $(OUT)/$(EXECUTOR_LANGCHAIN_SERVICE_NAME)

# Service-specific variables
LANGCHAIN_IMAGE := executor-langchain
LANGCHAIN_TAG ?= latest
LANGCHAIN_NAMESPACE ?= default

# Pre-calculate all stamp paths
EXECUTOR_LANGCHAIN_STAMP_DEPS := $(EXECUTOR_LANGCHAIN_OUT)/stamp-deps
EXECUTOR_LANGCHAIN_STAMP_BUILD := $(EXECUTOR_LANGCHAIN_OUT)/stamp-build
EXECUTOR_LANGCHAIN_STAMP_INSTALL := $(EXECUTOR_LANGCHAIN_OUT)/stamp-install
EXECUTOR_LANGCHAIN_STAMP_TEST := $(EXECUTOR_LANGCHAIN_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_OUT)
# Clean up Python artifacts
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/dist
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/htmlcov
CLEAN_TARGETS += $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context

# Define phony targets
.PHONY: $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-build $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-install $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-uninstall $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev-deps $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-test

# Dependencies
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-deps: $(EXECUTOR_LANGCHAIN_STAMP_DEPS)
$(EXECUTOR_LANGCHAIN_STAMP_DEPS): $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	@touch $@

# Build target
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-build: $(EXECUTOR_LANGCHAIN_STAMP_BUILD) # HELP: Build LangChain executor engine Docker image
$(EXECUTOR_LANGCHAIN_STAMP_BUILD): $(EXECUTOR_LANGCHAIN_STAMP_DEPS)
	@mkdir -p $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context
	cp $(ARK_SDK_WHL) $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context/
	cd $(EXECUTOR_LANGCHAIN_SERVICE_DIR) && docker build -t $(LANGCHAIN_IMAGE):$(LANGCHAIN_TAG) .
	@rm -rf $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context
	@touch $@

# Install target
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-install: $(EXECUTOR_LANGCHAIN_STAMP_INSTALL) # HELP: Deploy LangChain executor engine to cluster
$(EXECUTOR_LANGCHAIN_STAMP_INSTALL): $(EXECUTOR_LANGCHAIN_STAMP_BUILD)
	@mkdir -p $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context
	cp $(ARK_SDK_WHL) $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context/
	./scripts/build-and-push.sh -i $(LANGCHAIN_IMAGE) -t $(LANGCHAIN_TAG) -f $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/Dockerfile -c $(EXECUTOR_LANGCHAIN_SERVICE_DIR)
	@rm -rf $(EXECUTOR_LANGCHAIN_SERVICE_DIR)/build-context
	cd $(EXECUTOR_LANGCHAIN_SERVICE_DIR) && helm upgrade --install executor-langchain ./chart -n $(LANGCHAIN_NAMESPACE) --create-namespace --set image.repository=$(LANGCHAIN_IMAGE) --set image.tag=$(LANGCHAIN_TAG)
	@touch $@

# Dev target dependencies - prepare local environment  
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev-deps: $(ARK_SDK_WHL)
	cd $(EXECUTOR_LANGCHAIN_SERVICE_DIR) && \
	uv remove ark-sdk || true && \
	uv add $(ARK_SDK_WHL) && \
	uv sync

# Dev target
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev: $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev-deps # HELP: Run LangChain executor locally for development
	cd $(EXECUTOR_LANGCHAIN_SERVICE_DIR) && \
	uv run python -m langchain_executor

# Uninstall target
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-uninstall: # HELP: Remove LangChain executor engine from cluster
	helm uninstall executor-langchain -n $(LANGCHAIN_NAMESPACE) --ignore-not-found
	rm -f $(EXECUTOR_LANGCHAIN_STAMP_INSTALL)

# Test target
$(EXECUTOR_LANGCHAIN_SERVICE_NAME)-test: $(EXECUTOR_LANGCHAIN_STAMP_TEST) # HELP: Run tests for LangChain executor engine
$(EXECUTOR_LANGCHAIN_STAMP_TEST): $(EXECUTOR_LANGCHAIN_SERVICE_NAME)-dev-deps | $(OUT)
	@mkdir -p $(dir $@)
	@printf '\033[0;31m⚠️  NO TESTS ARE DEFINED for $(EXECUTOR_LANGCHAIN_SERVICE_NAME)\033[0m\n'
	@touch $@
