# evaluator-metric service build configuration

EVALUATOR_METRIC_SERVICE_NAME := evaluator-metric
EVALUATOR_METRIC_SERVICE_DIR := services/$(EVALUATOR_METRIC_SERVICE_NAME)
EVALUATOR_METRIC_OUT := $(OUT)/$(EVALUATOR_METRIC_SERVICE_NAME)

# Service-specific variables
EVALUATOR_METRIC_IMAGE := evaluator-metric
EVALUATOR_METRIC_TAG ?= latest
EVALUATOR_METRIC_NAMESPACE ?= default

# Pre-calculate all stamp paths
EVALUATOR_METRIC_STAMP_DEPS := $(EVALUATOR_METRIC_OUT)/stamp-deps
EVALUATOR_METRIC_STAMP_TEST := $(EVALUATOR_METRIC_OUT)/stamp-test
EVALUATOR_METRIC_STAMP_BUILD := $(EVALUATOR_METRIC_OUT)/stamp-build
EVALUATOR_METRIC_STAMP_INSTALL := $(EVALUATOR_METRIC_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(EVALUATOR_METRIC_OUT)
# Clean up Python artifacts
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/dist
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/build
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/htmlcov
# Clean up build artifacts
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/ark_sdk-*.whl
CLEAN_TARGETS += $(EVALUATOR_METRIC_SERVICE_DIR)/pyproject.toml.bak

# Define phony targets
.PHONY: $(EVALUATOR_METRIC_SERVICE_NAME)-build $(EVALUATOR_METRIC_SERVICE_NAME)-install $(EVALUATOR_METRIC_SERVICE_NAME)-uninstall $(EVALUATOR_METRIC_SERVICE_NAME)-dev $(EVALUATOR_METRIC_SERVICE_NAME)-test

# Dependencies
$(EVALUATOR_METRIC_SERVICE_NAME)-deps: $(EVALUATOR_METRIC_STAMP_DEPS)
$(EVALUATOR_METRIC_STAMP_DEPS): $(EVALUATOR_METRIC_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	# Copy wheel to service directory for Docker build
	cp $(ARK_SDK_WHL) $(EVALUATOR_METRIC_SERVICE_DIR)/
	# Update pyproject.toml to use local wheel file 
	cd $(EVALUATOR_METRIC_SERVICE_DIR) && \
	sed -i.bak 's|path = ".*ark_sdk-.*\.whl"|path = "./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl"|' pyproject.toml && \
	uv remove ark_sdk || true && \
	uv add ./ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl && \
	rm -f uv.lock && uv sync
	@touch $@

# Test target
$(EVALUATOR_METRIC_SERVICE_NAME)-test: $(EVALUATOR_METRIC_STAMP_TEST) # HELP: Run tests for metric evaluator service
$(EVALUATOR_METRIC_STAMP_TEST): $(EVALUATOR_METRIC_STAMP_DEPS)
	cd $(EVALUATOR_METRIC_SERVICE_DIR) && uv run python -m pytest tests/
	@touch $@

# Build target
$(EVALUATOR_METRIC_SERVICE_NAME)-build: $(EVALUATOR_METRIC_STAMP_BUILD) # HELP: Build metric evaluator service Docker image
$(EVALUATOR_METRIC_STAMP_BUILD): $(EVALUATOR_METRIC_STAMP_DEPS)
	cd $(EVALUATOR_METRIC_SERVICE_DIR) && docker build -t $(EVALUATOR_METRIC_IMAGE):$(EVALUATOR_METRIC_TAG) -f Dockerfile .
	@touch $@

# Install target
$(EVALUATOR_METRIC_SERVICE_NAME)-install: $(EVALUATOR_METRIC_STAMP_INSTALL) # HELP: Deploy metric evaluator service to cluster
$(EVALUATOR_METRIC_STAMP_INSTALL): $(EVALUATOR_METRIC_STAMP_BUILD)
	./scripts/build-and-push.sh -i $(EVALUATOR_METRIC_IMAGE) -t $(EVALUATOR_METRIC_TAG) -f $(EVALUATOR_METRIC_SERVICE_DIR)/Dockerfile -c $(EVALUATOR_METRIC_SERVICE_DIR)
	cd $(EVALUATOR_METRIC_SERVICE_DIR) && helm upgrade --install evaluator-metric ./chart -n $(EVALUATOR_METRIC_NAMESPACE) --create-namespace --set image.repository=$(EVALUATOR_METRIC_IMAGE) --set image.tag=$(EVALUATOR_METRIC_TAG)
	@touch $@

# Uninstall target
$(EVALUATOR_METRIC_SERVICE_NAME)-uninstall: # HELP: Remove metric evaluator service from cluster
	helm uninstall evaluator-metric -n $(EVALUATOR_METRIC_NAMESPACE) --ignore-not-found
	rm -f $(EVALUATOR_METRIC_STAMP_INSTALL)

# Dev target
$(EVALUATOR_METRIC_SERVICE_NAME)-dev: $(EVALUATOR_METRIC_STAMP_DEPS) # HELP: Run metric evaluator service in development mode
	cd $(EVALUATOR_METRIC_SERVICE_DIR) && uv run python -m evaluator_metric
