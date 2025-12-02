# ark-event-manager service build configuration

ARK_EVENT_MANAGER_SERVICE_NAME := ark-event-manager
ARK_EVENT_MANAGER_SERVICE_DIR := services/$(ARK_EVENT_MANAGER_SERVICE_NAME)
ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR := $(ARK_EVENT_MANAGER_SERVICE_DIR)/ark-event-manager
ARK_EVENT_MANAGER_OUT := $(OUT)/$(ARK_EVENT_MANAGER_SERVICE_NAME)

# Service-specific variables
ARK_EVENT_MANAGER_IMAGE := ark-event-manager
ARK_EVENT_MANAGER_TAG ?= latest
ARK_EVENT_MANAGER_NAMESPACE ?= default

# Pre-calculate all stamp paths
ARK_EVENT_MANAGER_STAMP_DEPS := $(ARK_EVENT_MANAGER_OUT)/stamp-deps
ARK_EVENT_MANAGER_STAMP_TEST := $(ARK_EVENT_MANAGER_OUT)/stamp-test
ARK_EVENT_MANAGER_STAMP_BUILD := $(ARK_EVENT_MANAGER_OUT)/stamp-build
ARK_EVENT_MANAGER_STAMP_INSTALL := $(ARK_EVENT_MANAGER_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_OUT)
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_DIR)/out

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_EVENT_MANAGER_STAMP_INSTALL)

# Clean up Python artifacts
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/.ruff_cache
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/*.egg-info
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/dist
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/build
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/.coverage
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/htmlcov
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/coverage
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/generated
CLEAN_TARGETS += $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/*.db

# Define phony targets
.PHONY: $(ARK_EVENT_MANAGER_SERVICE_NAME)-build $(ARK_EVENT_MANAGER_SERVICE_NAME)-install $(ARK_EVENT_MANAGER_SERVICE_NAME)-uninstall $(ARK_EVENT_MANAGER_SERVICE_NAME)-dev $(ARK_EVENT_MANAGER_SERVICE_NAME)-test $(ARK_EVENT_MANAGER_SERVICE_NAME)-clean-stamps

# Generate clean-stamps target
$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARK_EVENT_MANAGER_SERVICE_NAME)))

# Dependencies
$(ARK_EVENT_MANAGER_SERVICE_NAME)-deps: $(ARK_EVENT_MANAGER_STAMP_DEPS)
$(ARK_EVENT_MANAGER_STAMP_DEPS): $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR)/pyproject.toml | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR) && \
	rm -f uv.lock && uv sync --extra dev
	@touch $@

# Test target
$(ARK_EVENT_MANAGER_SERVICE_NAME)-test: $(ARK_EVENT_MANAGER_STAMP_TEST) # HELP: Run ARK Event Manager tests
$(ARK_EVENT_MANAGER_STAMP_TEST): $(ARK_EVENT_MANAGER_STAMP_DEPS)
	cd $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR) && \
	uv run python generate_proto.py && \
	uv run pytest tests/ -v --tb=short -m "unit"
	@touch $@

# Build target
$(ARK_EVENT_MANAGER_SERVICE_NAME)-build: $(ARK_EVENT_MANAGER_STAMP_BUILD) # HELP: Build ARK Event Manager Docker image
$(ARK_EVENT_MANAGER_STAMP_BUILD): $(ARK_EVENT_MANAGER_STAMP_TEST)
	cd $(ARK_EVENT_MANAGER_SERVICE_DIR) && docker build -t $(ARK_EVENT_MANAGER_IMAGE):$(ARK_EVENT_MANAGER_TAG) .
	@touch $@

# Install target
$(ARK_EVENT_MANAGER_SERVICE_NAME)-install: $(ARK_EVENT_MANAGER_STAMP_INSTALL) # HELP: Deploy ARK Event Manager to cluster
$(ARK_EVENT_MANAGER_STAMP_INSTALL): $(ARK_EVENT_MANAGER_STAMP_BUILD) $$(LOCALHOST_GATEWAY_STAMP_INSTALL)
	echo "Installing ark-event-manager..."
	cd ${ARK_EVENT_MANAGER_SERVICE_DIR}
	./scripts/build-and-push.sh -i $(ARK_EVENT_MANAGER_IMAGE) -t $(ARK_EVENT_MANAGER_TAG) -f $(ARK_EVENT_MANAGER_SERVICE_DIR)/Dockerfile -c $(ARK_EVENT_MANAGER_SERVICE_DIR)
	helm upgrade --install $(ARK_EVENT_MANAGER_SERVICE_NAME) $(ARK_EVENT_MANAGER_SERVICE_DIR)/chart \
		--namespace $(ARK_EVENT_MANAGER_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(ARK_EVENT_MANAGER_IMAGE) \
		--set app.image.tag=$(ARK_EVENT_MANAGER_TAG) \
		--set httpRoute.enabled=true \
		--wait \
		--timeout=5m
	@echo "ark-event-manager installed successfully"
	@echo "Routes available via localhost-gateway:"
	@echo "  http://ark-event-manager.127.0.0.1.nip.io"
	@echo "  http://ark-event-manager.default.127.0.0.1.nip.io"
	@touch $@

# Uninstall target
$(ARK_EVENT_MANAGER_SERVICE_NAME)-uninstall: # HELP: Remove ARK Event Manager from cluster
	@echo "Uninstalling ark-event-manager..."
	helm uninstall $(ARK_EVENT_MANAGER_SERVICE_NAME) --namespace $(ARK_EVENT_MANAGER_NAMESPACE) --ignore-not-found
	@echo "ark-event-manager uninstalled successfully"
	rm -f $(ARK_EVENT_MANAGER_STAMP_INSTALL)

# Dev target
$(ARK_EVENT_MANAGER_SERVICE_NAME)-dev: $(ARK_EVENT_MANAGER_STAMP_TEST) $(ARK_EVENT_MANAGER_STAMP_DEPS) # HELP: Run ARK Event Manager in development mode
	cd $(ARK_EVENT_MANAGER_SERVICE_SOURCE_DIR) && uv sync --extra dev && \
	USE_DATABASE=true uv run python -m ark_event_manager

