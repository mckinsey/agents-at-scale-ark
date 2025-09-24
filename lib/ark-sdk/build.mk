# ark-sdk library build configuration

ARK_SDK_LIB_NAME := ark-sdk
ARK_SDK_LIB_DIR := lib/$(ARK_SDK_LIB_NAME)
ARK_SDK_OUT := $(OUT)/$(ARK_SDK_LIB_NAME)

# Library-specific variables
ARK_SDK_VERSION := $(shell cat version.txt)
ARK_SDK_WHEEL_NAME := ark_sdk-$(ARK_SDK_VERSION)-py3-none-any.whl
ARK_SDK_WHL := $(ARK_SDK_OUT)/py-sdk/dist/$(ARK_SDK_WHEEL_NAME)
ARK_SDK_CRD_FILES := $(wildcard ark/config/crd/bases/ark*.yaml)
ARK_SDK_OPENAPI := $(ARK_SDK_OUT)/ark_schema.json
ARK_SDK_OVERLAY_FILES := $(wildcard $(ARK_SDK_LIB_DIR)/gen_sdk/overlay/python/ark_sdk/*.py)

# Pre-calculate all stamp paths
ARK_SDK_STAMP_BUILD := $(ARK_SDK_OUT)/stamp-build
ARK_SDK_STAMP_TEST := $(ARK_SDK_OUT)/stamp-test

# Add library output directory to clean targets
CLEAN_TARGETS += $(ARK_SDK_OUT)
# Clean up Python artifacts from uv sync
CLEAN_TARGETS += $(ARK_SDK_LIB_DIR)/__pycache__
CLEAN_TARGETS += $(ARK_SDK_LIB_DIR)/.pytest_cache
CLEAN_TARGETS += $(ARK_SDK_LIB_DIR)/node_modules
CLEAN_TARGETS += $(ARK_SDK_LIB_DIR)/out

# Define phony targets
.PHONY: $(ARK_SDK_LIB_NAME)-build $(ARK_SDK_LIB_NAME)-test $(ARK_SDK_LIB_NAME)-clean-stamps

# Generate clean-stamps target
$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARK_SDK_LIB_NAME)))

# Build target
$(ARK_SDK_LIB_NAME)-build: $(ARK_SDK_STAMP_BUILD) # HELP: Build ARK Python SDK wheel
$(ARK_SDK_STAMP_BUILD): $(ARK_SDK_WHL)
	@touch $@

# Generate OpenAPI schema from CRDs
$(ARK_SDK_OPENAPI): $(ARK_SDK_CRD_FILES) | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_SDK_LIB_DIR) && uv run python crd_to_openapi.py $(addprefix $(BUILD_ROOT)/,$(ARK_SDK_CRD_FILES)) > $@

# Build Python wheel in $(OUT) directory
$(ARK_SDK_WHL): $(ARK_SDK_OPENAPI) $(ARK_SDK_LIB_DIR)/generate_ark_clients.py $(ARK_SDK_LIB_DIR)/pyproject.toml $(ARK_SDK_OVERLAY_FILES) | $(OUT)
	@mkdir -p $(ARK_SDK_OUT)/py-sdk
	cd $(ARK_SDK_LIB_DIR) && PATH="$(BUILD_EXTRA_PATH)" npx --yes @openapitools/openapi-generator-cli generate -i $(ARK_SDK_OPENAPI) -g python -o $(ARK_SDK_OUT)/py-sdk --package-name ark_sdk
	cd $(ARK_SDK_LIB_DIR) && tar -cf - -C gen_sdk/overlay/python . | tar -xf - -C $(ARK_SDK_OUT)/py-sdk
	cd $(ARK_SDK_LIB_DIR) && uv run python generate_ark_clients.py -v $(ARK_SDK_OPENAPI) > $(ARK_SDK_OUT)/py-sdk/ark_sdk/versions.py
	cd $(ARK_SDK_LIB_DIR) && uv run python generate_ark_clients.py -t $(ARK_SDK_OPENAPI) > $(ARK_SDK_OUT)/py-sdk/test/test_ark_client.py
	cd $(ARK_SDK_LIB_DIR) && uv sync
	cd $(ARK_SDK_OUT)/py-sdk && uv run python -m build .

# Test target
$(ARK_SDK_LIB_NAME)-test: $(ARK_SDK_STAMP_TEST) # HELP: Run ARK SDK tests
$(ARK_SDK_STAMP_TEST): $(ARK_SDK_WHL)
	cd $(ARK_SDK_OUT)/py-sdk && uv sync
	cd $(ARK_SDK_OUT)/py-sdk && uv run python -m pytest test
	@touch $@
