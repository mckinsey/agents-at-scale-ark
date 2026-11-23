ARGO_WORKFLOWS_SERVICE_NAME := argo-workflows
ARGO_WORKFLOWS_SERVICE_DIR := services/$(ARGO_WORKFLOWS_SERVICE_NAME)
ARGO_WORKFLOWS_EXPORTER_DIR := $(ARGO_WORKFLOWS_SERVICE_DIR)/exporter
ARGO_WORKFLOWS_OUT := $(OUT)/$(ARGO_WORKFLOWS_SERVICE_NAME)

ARGO_WORKFLOWS_EXPORTER_IMAGE := argo-workflows-exporter
ARGO_WORKFLOWS_EXPORTER_TAG ?= latest

ARGO_WORKFLOWS_STAMP_BUILD := $(ARGO_WORKFLOWS_OUT)/stamp-build
ARGO_WORKFLOWS_STAMP_INSTALL := $(ARGO_WORKFLOWS_OUT)/stamp-install
ARGO_WORKFLOWS_STAMP_TEST := $(ARGO_WORKFLOWS_OUT)/stamp-test

CLEAN_TARGETS += $(ARGO_WORKFLOWS_OUT)
CLEAN_TARGETS += $(ARGO_WORKFLOWS_EXPORTER_DIR)/.venv
CLEAN_TARGETS += $(ARGO_WORKFLOWS_EXPORTER_DIR)/.ruff_cache

.PHONY: $(ARGO_WORKFLOWS_SERVICE_NAME)-build $(ARGO_WORKFLOWS_SERVICE_NAME)-install $(ARGO_WORKFLOWS_SERVICE_NAME)-uninstall $(ARGO_WORKFLOWS_SERVICE_NAME)-dev $(ARGO_WORKFLOWS_SERVICE_NAME)-test $(ARGO_WORKFLOWS_SERVICE_NAME)-clean-stamps

$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARGO_WORKFLOWS_SERVICE_NAME)))

$(ARGO_WORKFLOWS_SERVICE_NAME)-build: $(ARGO_WORKFLOWS_STAMP_BUILD) # HELP: Build the argo-workflows-exporter Docker image
$(ARGO_WORKFLOWS_STAMP_BUILD): | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARGO_WORKFLOWS_EXPORTER_DIR) && docker build -t $(ARGO_WORKFLOWS_EXPORTER_IMAGE):$(ARGO_WORKFLOWS_EXPORTER_TAG) .
	@touch $@

$(ARGO_WORKFLOWS_SERVICE_NAME)-install: $(ARGO_WORKFLOWS_STAMP_INSTALL) # HELP: No-op; install Argo Workflows with devspace or Helm
$(ARGO_WORKFLOWS_STAMP_INSTALL): | $(OUT)
	@mkdir -p $(dir $@)
	@touch $@

$(ARGO_WORKFLOWS_SERVICE_NAME)-uninstall: # HELP: No-op; uninstall Argo Workflows with devspace or Helm
	rm -f $(ARGO_WORKFLOWS_STAMP_INSTALL)

$(ARGO_WORKFLOWS_SERVICE_NAME)-dev: # HELP: Run the exporter locally against the current kube context
	cd $(ARGO_WORKFLOWS_EXPORTER_DIR) && uv sync && uv run argo-workflows-exporter

$(ARGO_WORKFLOWS_SERVICE_NAME)-test: $(ARGO_WORKFLOWS_STAMP_TEST) # HELP: Run argo-workflows-exporter tests and lint
$(ARGO_WORKFLOWS_STAMP_TEST): | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARGO_WORKFLOWS_EXPORTER_DIR) && uv sync --frozen && uv run ruff check src tests && uv run python -m unittest discover -s tests -v
	@touch $@
