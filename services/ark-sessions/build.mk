ARK_SESSIONS_SERVICE_DIR := services/ark-sessions
ARK_SESSIONS_SERVICE_NAME := ark-sessions
ARK_SESSIONS_SERVICE_SOURCE_DIR := $(ARK_SESSIONS_SERVICE_DIR)/ark-sessions
ARK_SESSIONS_IMAGE := ark-sessions
ARK_SESSIONS_TAG := latest
ARK_SESSIONS_OUT := $(OUT)/$(ARK_SESSIONS_SERVICE_NAME)

ARK_SESSIONS_STAMP_BUILD := $(ARK_SESSIONS_OUT)/stamp-build
ARK_SESSIONS_STAMP_INSTALL := $(ARK_SESSIONS_OUT)/stamp-install
ARK_SESSIONS_STAMP_TEST := $(ARK_SESSIONS_OUT)/stamp-test

.PHONY: $(ARK_SESSIONS_SERVICE_NAME)-build $(ARK_SESSIONS_SERVICE_NAME)-test $(ARK_SESSIONS_SERVICE_NAME)-install

$(ARK_SESSIONS_SERVICE_NAME)-build: $(ARK_SESSIONS_STAMP_BUILD)
$(ARK_SESSIONS_STAMP_BUILD): $(ARK_SESSIONS_SERVICE_SOURCE_DIR)/pyproject.toml | $(OUT)
	@mkdir -p $(dir $@)
	@echo "Building $(ARK_SESSIONS_SERVICE_NAME)..."
	cd $(ARK_SESSIONS_SERVICE_DIR) && docker build -t $(ARK_SESSIONS_IMAGE):$(ARK_SESSIONS_TAG) -f Dockerfile .
	@touch $@

$(ARK_SESSIONS_SERVICE_NAME)-test: $(ARK_SESSIONS_STAMP_TEST)
$(ARK_SESSIONS_STAMP_TEST): $(ARK_SESSIONS_SERVICE_SOURCE_DIR)/pyproject.toml | $(OUT)
	@mkdir -p $(dir $@)
	@echo "Testing $(ARK_SESSIONS_SERVICE_NAME)..."
	cd $(ARK_SESSIONS_SERVICE_SOURCE_DIR) && uv run pytest tests/ || true
	@touch $@

$(ARK_SESSIONS_SERVICE_NAME)-install: $(ARK_SESSIONS_STAMP_INSTALL)
$(ARK_SESSIONS_STAMP_INSTALL): $(ARK_SESSIONS_STAMP_BUILD)
	@echo "Installing $(ARK_SESSIONS_SERVICE_NAME)..."
	./scripts/build-and-push.sh -i $(ARK_SESSIONS_IMAGE) -t $(ARK_SESSIONS_TAG) \
		-f $(ARK_SESSIONS_SERVICE_DIR)/Dockerfile \
		-c $(ARK_SESSIONS_SERVICE_DIR)
	cd $(ARK_SESSIONS_SERVICE_DIR) && \
		helm upgrade --install ark-sessions ./chart \
		-n default --create-namespace \
		--set app.image.repository=$(ARK_SESSIONS_IMAGE) \
		--set app.image.tag=$(ARK_SESSIONS_TAG)
	@touch $@
