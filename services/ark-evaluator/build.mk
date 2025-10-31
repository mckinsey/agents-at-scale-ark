# ark-evaluator service build configuration

ARK_EVALUATOR_SERVICE_NAME := ark-evaluator
ARK_EVALUATOR_SERVICE_DIR := services/$(ARK_EVALUATOR_SERVICE_NAME)
ARK_EVALUATOR_OUT := $(OUT)/$(ARK_EVALUATOR_SERVICE_NAME)

# Service-specific variables
EVALUATOR_IMAGE := ark-evaluator
EVALUATOR_TAG ?= latest
ARK_EVALUATOR_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_EVALUATOR_STAMP_DEPS := $(ARK_EVALUATOR_OUT)/stamp-deps
ARK_EVALUATOR_STAMP_TEST := $(ARK_EVALUATOR_OUT)/stamp-test
ARK_EVALUATOR_STAMP_BUILD := $(ARK_EVALUATOR_OUT)/stamp-build
ARK_EVALUATOR_STAMP_INSTALL := $(ARK_EVALUATOR_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_EVALUATOR_OUT)
# Clean up Python artifacts
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/dist
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/build
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/htmlcov
# Clean up build artifacts
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/ark_sdk-*.whl
CLEAN_TARGETS += $(ARK_EVALUATOR_SERVICE_DIR)/pyproject.toml.bak

# Define phony targets
.PHONY: $(ARK_EVALUATOR_SERVICE_NAME)-build $(ARK_EVALUATOR_SERVICE_NAME)-install $(ARK_EVALUATOR_SERVICE_NAME)-uninstall $(ARK_EVALUATOR_SERVICE_NAME)-dev $(ARK_EVALUATOR_SERVICE_NAME)-test

# Dependencies
$(ARK_EVALUATOR_SERVICE_NAME)-deps: $(ARK_EVALUATOR_STAMP_DEPS)
$(ARK_EVALUATOR_STAMP_DEPS): $(ARK_EVALUATOR_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	# Copy wheel to service directory for Docker build
	cp $(ARK_SDK_WHL) $(ARK_EVALUATOR_SERVICE_DIR)/
	# Update pyproject.toml to use local wheel file 
	cd $(ARK_EVALUATOR_SERVICE_DIR) && \
	sed -i.bak 's|path = "../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl"|path = "./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl"|' pyproject.toml && \
	uv remove ark_sdk || true && \
	uv add ./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl && \
	rm -f uv.lock && uv sync
	@touch $@

# Test target
$(ARK_EVALUATOR_SERVICE_NAME)-test: $(ARK_EVALUATOR_STAMP_TEST) # HELP: Run tests for evaluator service
$(ARK_EVALUATOR_STAMP_TEST): $(ARK_EVALUATOR_STAMP_DEPS)
	cd $(ARK_EVALUATOR_SERVICE_DIR) && uv run python -m pytest tests/
	@touch $@

# Build target
$(ARK_EVALUATOR_SERVICE_NAME)-build: $(ARK_EVALUATOR_STAMP_BUILD) # HELP: Build evaluator service Docker image
$(ARK_EVALUATOR_STAMP_BUILD): $(ARK_EVALUATOR_STAMP_DEPS)
	cd $(ARK_EVALUATOR_SERVICE_DIR) && docker build -t $(EVALUATOR_IMAGE):$(EVALUATOR_TAG) -f Dockerfile .
	@touch $@

# Install target
$(ARK_EVALUATOR_SERVICE_NAME)-install: $(ARK_EVALUATOR_STAMP_INSTALL) # HELP: Deploy evaluator service to cluster
$(ARK_EVALUATOR_STAMP_INSTALL): $(ARK_EVALUATOR_STAMP_BUILD)
	./scripts/build-and-push.sh -i $(EVALUATOR_IMAGE) -t $(EVALUATOR_TAG) -f $(ARK_EVALUATOR_SERVICE_DIR)/Dockerfile -c $(ARK_EVALUATOR_SERVICE_DIR)
	cd $(ARK_EVALUATOR_SERVICE_DIR) && helm upgrade --install ark-evaluator ./chart -n $(ARK_EVALUATOR_NAMESPACE) --create-namespace --set image.repository=$(EVALUATOR_IMAGE) --set image.tag=$(EVALUATOR_TAG) --set image.pullPolicy=Never
	@touch $@

# Uninstall target
$(ARK_EVALUATOR_SERVICE_NAME)-uninstall: # HELP: Remove evaluator service from cluster
	helm uninstall ark-evaluator -n $(ARK_EVALUATOR_NAMESPACE) --ignore-not-found
	rm -f $(ARK_EVALUATOR_STAMP_INSTALL)

# Dev target
$(ARK_EVALUATOR_SERVICE_NAME)-dev: $(ARK_EVALUATOR_STAMP_DEPS) # HELP: Run evaluator service in development mode
	cd $(ARK_EVALUATOR_SERVICE_DIR) && uv run python -m evaluator
