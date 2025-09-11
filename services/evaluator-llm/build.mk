# evaluator-llm service build configuration

EVALUATOR_LLM_SERVICE_NAME := evaluator-llm
EVALUATOR_LLM_SERVICE_DIR := services/$(EVALUATOR_LLM_SERVICE_NAME)
EVALUATOR_LLM_OUT := $(OUT)/$(EVALUATOR_LLM_SERVICE_NAME)

# Service-specific variables
EVALUATOR_IMAGE := evaluator-llm
EVALUATOR_TAG ?= latest
EVALUATOR_LLM_NAMESPACE ?= default

# Pre-calculate all stamp paths
EVALUATOR_LLM_STAMP_DEPS := $(EVALUATOR_LLM_OUT)/stamp-deps
EVALUATOR_LLM_STAMP_TEST := $(EVALUATOR_LLM_OUT)/stamp-test
EVALUATOR_LLM_STAMP_BUILD := $(EVALUATOR_LLM_OUT)/stamp-build
EVALUATOR_LLM_STAMP_INSTALL := $(EVALUATOR_LLM_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(EVALUATOR_LLM_OUT)
# Clean up Python artifacts
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/dist
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/build
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/htmlcov
# Clean up build artifacts
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/ark_sdk-*.whl
CLEAN_TARGETS += $(EVALUATOR_LLM_SERVICE_DIR)/pyproject.toml.bak

# Define phony targets
.PHONY: $(EVALUATOR_LLM_SERVICE_NAME)-build $(EVALUATOR_LLM_SERVICE_NAME)-install $(EVALUATOR_LLM_SERVICE_NAME)-uninstall $(EVALUATOR_LLM_SERVICE_NAME)-dev $(EVALUATOR_LLM_SERVICE_NAME)-test

# Dependencies
$(EVALUATOR_LLM_SERVICE_NAME)-deps: $(EVALUATOR_LLM_STAMP_DEPS)
$(EVALUATOR_LLM_STAMP_DEPS): $(EVALUATOR_LLM_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	# Copy wheel to service directory for Docker build
	cp $(ARK_SDK_WHL) $(EVALUATOR_LLM_SERVICE_DIR)/
	# Update pyproject.toml to use local wheel file 
	cd $(EVALUATOR_LLM_SERVICE_DIR) && \
	sed -i.bak 's|path = "../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl"|path = "./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl"|' pyproject.toml && \
	uv remove ark_sdk || true && \
	uv add ./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl && \
	rm -f uv.lock && uv sync
	@touch $@

# Test target
$(EVALUATOR_LLM_SERVICE_NAME)-test: $(EVALUATOR_LLM_STAMP_TEST) # HELP: Run tests for LLM evaluator service
$(EVALUATOR_LLM_STAMP_TEST): $(EVALUATOR_LLM_STAMP_DEPS)
	cd $(EVALUATOR_LLM_SERVICE_DIR) && uv run python -m pytest tests/
	@touch $@

# Build target
$(EVALUATOR_LLM_SERVICE_NAME)-build: $(EVALUATOR_LLM_STAMP_BUILD) # HELP: Build LLM evaluator service Docker image
$(EVALUATOR_LLM_STAMP_BUILD): $(EVALUATOR_LLM_STAMP_DEPS)
	cd $(EVALUATOR_LLM_SERVICE_DIR) && docker build -t $(EVALUATOR_IMAGE):$(EVALUATOR_TAG) -f Dockerfile .
	@touch $@

# Install target
$(EVALUATOR_LLM_SERVICE_NAME)-install: $(EVALUATOR_LLM_STAMP_INSTALL) # HELP: Deploy LLM evaluator service to cluster
$(EVALUATOR_LLM_STAMP_INSTALL): $(EVALUATOR_LLM_STAMP_BUILD)
	./scripts/build-and-push.sh -i $(EVALUATOR_IMAGE) -t $(EVALUATOR_TAG) -f $(EVALUATOR_LLM_SERVICE_DIR)/Dockerfile -c $(EVALUATOR_LLM_SERVICE_DIR)
	cd $(EVALUATOR_LLM_SERVICE_DIR) && helm upgrade --install evaluator-llm ./chart -n $(EVALUATOR_LLM_NAMESPACE) --create-namespace --set image.repository=$(EVALUATOR_IMAGE) --set image.tag=$(EVALUATOR_TAG)
	@touch $@

# Uninstall target
$(EVALUATOR_LLM_SERVICE_NAME)-uninstall: # HELP: Remove LLM evaluator service from cluster
	helm uninstall evaluator-llm -n $(EVALUATOR_LLM_NAMESPACE) --ignore-not-found
	rm -f $(EVALUATOR_LLM_STAMP_INSTALL)

# Dev target
$(EVALUATOR_LLM_SERVICE_NAME)-dev: $(EVALUATOR_LLM_STAMP_DEPS) # HELP: Run LLM evaluator service in development mode
	cd $(EVALUATOR_LLM_SERVICE_DIR) && uv run python -m src.evaluator_llm.main
