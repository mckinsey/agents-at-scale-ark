# ark-api service build configuration

ARK_API_SERVICE_NAME := ark-api
ARK_API_SERVICE_DIR := services/$(ARK_API_SERVICE_NAME)
ARK_API_SERVICE_SOURCE_DIR := $(ARK_API_SERVICE_DIR)/ark-api
ARK_API_OUT := $(OUT)/$(ARK_API_SERVICE_NAME)

# Service-specific variables
ARK_API_IMAGE := ark-api
ARK_API_TAG ?= latest
ARK_API_NAMESPACE ?= default
CORS_ORIGINS ?= http://localhost:3000

# Pre-calculate all stamp paths
ARK_API_STAMP_DEPS := $(ARK_API_OUT)/stamp-deps
ARK_API_STAMP_TEST := $(ARK_API_OUT)/stamp-test
ARK_API_STAMP_BUILD := $(ARK_API_OUT)/stamp-build
ARK_API_STAMP_INSTALL := $(ARK_API_OUT)/stamp-install

# Add service output directory to clean targets
CLEAN_TARGETS += $(ARK_API_OUT)
# Clean up local out directory that shouldn't exist
CLEAN_TARGETS += $(ARK_API_SERVICE_DIR)/out
CLEAN_TARGETS += $(ARK_API_SERVICE_DIR)/ark-api/out

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_API_STAMP_INSTALL)

# Clean up Python artifacts
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/.ruff_cache
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/*.egg-info
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/dist
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/build
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/.coverage
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/htmlcov
CLEAN_TARGETS += $(ARK_API_SERVICE_SOURCE_DIR)/coverage

# Define phony targets
.PHONY: $(ARK_API_SERVICE_NAME)-build $(ARK_API_SERVICE_NAME)-install $(ARK_API_SERVICE_NAME)-uninstall $(ARK_API_SERVICE_NAME)-dev $(ARK_API_SERVICE_NAME)-test $(ARK_API_SERVICE_NAME)-clean-stamps

# Generate clean-stamps target
$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARK_API_SERVICE_NAME)))

# Dependencies
$(ARK_API_SERVICE_NAME)-deps: $(ARK_API_STAMP_DEPS)
$(ARK_API_STAMP_DEPS): $(ARK_API_SERVICE_SOURCE_DIR)/pyproject.toml $(ARK_SDK_WHL) | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_API_SERVICE_SOURCE_DIR) && uv remove ark_sdk || true && \
	uv add $(ARK_SDK_WHL) && \
	rm -f uv.lock && uv sync
	@touch $@

# OpenAPI generation (side effect of test)
$(ARK_API_SERVICE_DIR)/openapi.json: $(ARK_API_STAMP_DEPS)
	cd $(ARK_API_SERVICE_SOURCE_DIR) && uv run python generate_openapi.py && cp openapi.json ..

# Test target
$(ARK_API_SERVICE_NAME)-test: $(ARK_API_STAMP_TEST) # HELP: Run ARK API server tests
$(ARK_API_STAMP_TEST): $(ARK_API_STAMP_DEPS)
	cd $(ARK_API_SERVICE_SOURCE_DIR) && mkdir -p coverage && \
	uv run coverage run -m unittest discover -s tests -p 'test_*.py' -v && \
	uv run coverage html && \
	uv run coverage lcov && \
	uv run python generate_openapi.py && cp openapi.json ..
	@touch $@

# Build target
$(ARK_API_SERVICE_NAME)-build: $(ARK_API_STAMP_BUILD) # HELP: Build ARK API server Docker image
$(ARK_API_STAMP_BUILD): $(ARK_API_STAMP_TEST) $(ARK_SDK_WHL)
	@mkdir -p $(ARK_API_SERVICE_DIR)/ark-api/out
	cp $(ARK_SDK_WHL) $(ARK_API_SERVICE_DIR)/ark-api/out/
	cd $(ARK_API_SERVICE_DIR) && docker build -t $(ARK_API_IMAGE):$(ARK_API_TAG) .
	@rm -rf $(ARK_API_SERVICE_DIR)/ark-api/out
	@touch $@

# Install target
$(ARK_API_SERVICE_NAME)-install: $(ARK_API_STAMP_INSTALL) # HELP: Deploy ARK API server to cluster
$(ARK_API_STAMP_INSTALL): $(ARK_API_STAMP_BUILD) $$(LOCALHOST_GATEWAY_STAMP_INSTALL)
	echo "Installing ark-api..."
	@mkdir -p $(ARK_API_SERVICE_DIR)/ark-api/out
	cp $(ARK_SDK_WHL) $(ARK_API_SERVICE_DIR)/ark-api/out/
	# Update pyproject.toml to use local wheel file
	cd $(ARK_API_SERVICE_DIR)/ark-api && \
	sed -i.bak 's|path = "../../out/ark-sdk/py-sdk/dist/ark_sdk-.*\.whl"|path = "./out/ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl"|' pyproject.toml && \
	uv remove ark_sdk || true && \
	uv add ./out/ark_sdk-$(shell cat $(BUILD_ROOT)/version.txt)-py3-none-any.whl && \
	rm -f uv.lock && uv sync
	cd ${ARK_API_SERVICE_DIR}
	./scripts/build-and-push.sh -i $(ARK_API_IMAGE) -t $(ARK_API_TAG) -f $(ARK_API_SERVICE_DIR)/Dockerfile -c $(ARK_API_SERVICE_DIR)
	helm upgrade --install $(ARK_API_SERVICE_NAME) $(ARK_API_SERVICE_DIR)/chart \
		--namespace $(ARK_API_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(ARK_API_IMAGE) \
		--set app.image.tag=$(ARK_API_TAG) \
		--set httpRoute.enabled=true \
		--wait \
		--timeout=5m
	@echo "ark-api installed successfully"
	@echo "Routes available via localhost-gateway:"
	@echo "  http://ark-api.127.0.0.1.nip.io"
	@echo "  http://ark-api.default.127.0.0.1.nip.io"
	@touch $@

# Uninstall target
$(ARK_API_SERVICE_NAME)-uninstall: # HELP: Remove ARK API server from cluster
	@echo "Uninstalling ark-api..."
	helm uninstall $(ARK_API_SERVICE_NAME) --namespace $(ARK_API_NAMESPACE) --ignore-not-found
	@echo "ark-api uninstalled successfully"
	rm -f $(ARK_API_STAMP_INSTALL)

# Dev target
$(ARK_API_SERVICE_NAME)-dev: $(ARK_API_STAMP_TEST) $(ARK_API_STAMP_DEPS) # HELP: Run ARK API server in development mode
	cd $(ARK_API_SERVICE_SOURCE_DIR) && uv add $(ARK_SDK_WHL) && uv sync && \
	PYTHONPATH=../../../lib/ark-sdk/gen_sdk/overlay/python:$$PYTHONPATH CORS_ORIGINS=$(CORS_ORIGINS) uv run python -m uvicorn --host 0.0.0.0 --port 8000 --reload src.ark_api.main:app


