# ark-api-a2a service build configuration

ARK_API_A2A_SERVICE_NAME := ark-api-a2a
ARK_API_A2A_SERVICE_DIR := services/$(ARK_API_A2A_SERVICE_NAME)
ARK_API_A2A_OUT := $(OUT)/$(ARK_API_A2A_SERVICE_NAME)

# Service-specific variables
ARK_API_A2A_IMAGE := ark-api-a2a
ARK_API_A2A_TAG ?= latest
ARK_API_A2A_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_API_A2A_STAMP_DEPS := $(ARK_API_A2A_OUT)/stamp-deps
ARK_API_A2A_STAMP_TEST := $(ARK_API_A2A_OUT)/stamp-test
ARK_API_A2A_STAMP_BUILD := $(ARK_API_A2A_OUT)/stamp-build
ARK_API_A2A_STAMP_INSTALL := $(ARK_API_A2A_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_API_A2A_OUT)
# Clean up local out directory that shouldn't exist
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/out

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_API_A2A_STAMP_INSTALL)

# Clean up Python artifacts
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/.ruff_cache
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/*.egg-info
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/dist
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/build
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/.coverage
CLEAN_TARGETS += $(ARK_API_A2A_SERVICE_DIR)/htmlcov

# Define phony targets
.PHONY: $(ARK_API_A2A_SERVICE_NAME)-build $(ARK_API_A2A_SERVICE_NAME)-install $(ARK_API_A2A_SERVICE_NAME)-uninstall $(ARK_API_A2A_SERVICE_NAME)-dev $(ARK_API_A2A_SERVICE_NAME)-test

# Dependencies
$(ARK_API_A2A_SERVICE_NAME)-deps: $(ARK_API_A2A_STAMP_DEPS)
$(ARK_API_A2A_STAMP_DEPS): $(ARK_API_A2A_SERVICE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_API_A2A_SERVICE_DIR) && uv remove ark_sdk || true && \
	uv add $(ARK_SDK_WHL) && \
	rm -f uv.lock && uv sync
	@touch $@

# Test target
$(ARK_API_A2A_SERVICE_NAME)-test: $(ARK_API_A2A_STAMP_TEST)
$(ARK_API_A2A_STAMP_TEST): $(ARK_API_A2A_STAMP_DEPS)
	cd $(ARK_API_A2A_SERVICE_DIR) && ruff check && mkdir -p coverage && \
	uv run coverage run -m unittest discover -s tests -p 'test_*.py' -v && \
	uv run coverage html && \
	uv run coverage lcov
	@touch $@

# Build target
$(ARK_API_A2A_SERVICE_NAME)-build: $(ARK_API_A2A_STAMP_BUILD) # HELP: Build ARK A2A Gateway service Docker image
$(ARK_API_A2A_STAMP_BUILD): $(ARK_API_A2A_STAMP_TEST) $(ARK_SDK_WHL)
	@mkdir -p $(ARK_API_A2A_SERVICE_DIR)/out
	cp $(ARK_SDK_WHL) $(ARK_API_A2A_SERVICE_DIR)/out/
	cd $(ARK_API_A2A_SERVICE_DIR) && docker build -t $(ARK_API_A2A_IMAGE):$(ARK_API_A2A_TAG) .
	@rm -rf $(ARK_API_A2A_SERVICE_DIR)/out
	@touch $@

# Install target
$(ARK_API_A2A_SERVICE_NAME)-install: $(ARK_API_A2A_STAMP_INSTALL) # HELP: Deploy ARK A2A Gateway service to cluster
$(ARK_API_A2A_STAMP_INSTALL): $(ARK_API_A2A_STAMP_BUILD) $$(ARK_API_STAMP_INSTALL) $$(LOCALHOST_GATEWAY_STAMP_INSTALL)
	@echo "Installing ark-api-a2a with Gateway API support..."
	@echo "Building and pushing image..."
	@mkdir -p $(ARK_API_A2A_SERVICE_DIR)/out
	cp $(ARK_SDK_WHL) $(ARK_API_A2A_SERVICE_DIR)/out/
	./scripts/build-and-push.sh -i $(ARK_API_A2A_IMAGE) -t $(ARK_API_A2A_TAG) -f $(ARK_API_A2A_SERVICE_DIR)/Dockerfile -c $(ARK_API_A2A_SERVICE_DIR)
	@rm -rf $(ARK_API_A2A_SERVICE_DIR)/out
	@echo "Installing with Helm chart..."
	helm upgrade --install $(ARK_API_A2A_SERVICE_NAME) $(ARK_API_A2A_SERVICE_DIR)/chart \
		--namespace $(ARK_API_A2A_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(ARK_API_A2A_IMAGE) \
		--set app.image.tag=$(ARK_API_A2A_TAG) \
		--set httpRoute.enabled=true \
		--wait \
		--timeout=5m
	@echo "ark-api-a2a installed successfully!"
	@touch $@

# Uninstall target
$(ARK_API_A2A_SERVICE_NAME)-uninstall: # HELP: Remove ARK A2A Gateway service from cluster
	@echo "Uninstalling ark-api-a2a..."
	helm uninstall $(ARK_API_A2A_SERVICE_NAME) --namespace $(ARK_API_A2A_NAMESPACE) --ignore-not-found
	@echo "ark-api-a2a uninstalled successfully"
	rm -f $(ARK_API_A2A_STAMP_INSTALL)

# Dev target
$(ARK_API_A2A_SERVICE_NAME)-dev: $(ARK_API_A2A_STAMP_DEPS)
	cd $(ARK_API_A2A_SERVICE_DIR) && uv add $(ARK_SDK_WHL) && uv sync && \
	uv run uvicorn src.a2agw.main:app --reload --host 0.0.0.0 --port 7184
