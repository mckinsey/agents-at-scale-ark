# kubernetes-mcp-server service build configuration

KUBERNETES_MCP_SERVER_SERVICE_NAME := kubernetes-mcp-server
KUBERNETES_MCP_SERVER_SERVICE_DIR := services/$(KUBERNETES_MCP_SERVER_SERVICE_NAME)
KUBERNETES_MCP_SERVER_CHART_DIR := $(KUBERNETES_MCP_SERVER_SERVICE_DIR)/chart
KUBERNETES_MCP_SERVER_OUT := $(OUT)/$(KUBERNETES_MCP_SERVER_SERVICE_NAME)

# Service-specific variables
KUBERNETES_MCP_SERVER_NAMESPACE ?= default

# Pre-calculate all stamp paths
KUBERNETES_MCP_SERVER_STAMP_BUILD := $(KUBERNETES_MCP_SERVER_OUT)/stamp-build
KUBERNETES_MCP_SERVER_STAMP_INSTALL := $(KUBERNETES_MCP_SERVER_OUT)/stamp-install
KUBERNETES_MCP_SERVER_STAMP_TEST := $(KUBERNETES_MCP_SERVER_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(KUBERNETES_MCP_SERVER_OUT)

# Define phony targets
.PHONY: $(KUBERNETES_MCP_SERVER_SERVICE_NAME)-build $(KUBERNETES_MCP_SERVER_SERVICE_NAME)-install $(KUBERNETES_MCP_SERVER_SERVICE_NAME)-uninstall $(KUBERNETES_MCP_SERVER_SERVICE_NAME)-dev $(KUBERNETES_MCP_SERVER_SERVICE_NAME)-test

# Build target - fetch the upstream chart dependency
$(KUBERNETES_MCP_SERVER_SERVICE_NAME)-build: $(KUBERNETES_MCP_SERVER_STAMP_BUILD) # HELP: Fetch kubernetes-mcp-server chart dependencies
$(KUBERNETES_MCP_SERVER_STAMP_BUILD): $(KUBERNETES_MCP_SERVER_CHART_DIR)/Chart.yaml | $(OUT)
	@mkdir -p $(dir $@)
	helm dependency build $(KUBERNETES_MCP_SERVER_CHART_DIR)
	@touch $@

# Install target
$(KUBERNETES_MCP_SERVER_SERVICE_NAME)-install: $(KUBERNETES_MCP_SERVER_STAMP_INSTALL) # HELP: Deploy kubernetes-mcp-server to cluster
$(KUBERNETES_MCP_SERVER_STAMP_INSTALL): $(KUBERNETES_MCP_SERVER_STAMP_BUILD) | $(OUT)
	@mkdir -p $(dir $@)
	helm upgrade --install $(KUBERNETES_MCP_SERVER_SERVICE_NAME) $(KUBERNETES_MCP_SERVER_CHART_DIR) \
		--namespace $(KUBERNETES_MCP_SERVER_NAMESPACE) --create-namespace
	@touch $@

# Dev target - deploy the chart to the cluster (chart-only service, no local process)
$(KUBERNETES_MCP_SERVER_SERVICE_NAME)-dev: $(KUBERNETES_MCP_SERVER_STAMP_BUILD) # HELP: Deploy kubernetes-mcp-server for development
	helm upgrade --install $(KUBERNETES_MCP_SERVER_SERVICE_NAME) $(KUBERNETES_MCP_SERVER_CHART_DIR) \
		--namespace $(KUBERNETES_MCP_SERVER_NAMESPACE) --create-namespace

# Uninstall target
$(KUBERNETES_MCP_SERVER_SERVICE_NAME)-uninstall: # HELP: Remove kubernetes-mcp-server from cluster
	helm uninstall $(KUBERNETES_MCP_SERVER_SERVICE_NAME) --namespace $(KUBERNETES_MCP_SERVER_NAMESPACE) --ignore-not-found
	rm -f $(KUBERNETES_MCP_SERVER_STAMP_INSTALL)

# Test target
$(KUBERNETES_MCP_SERVER_SERVICE_NAME)-test: $(KUBERNETES_MCP_SERVER_STAMP_TEST) # HELP: Run tests for kubernetes-mcp-server service
$(KUBERNETES_MCP_SERVER_STAMP_TEST): $(KUBERNETES_MCP_SERVER_STAMP_BUILD) | $(OUT)
	@mkdir -p $(dir $@)
	helm lint $(KUBERNETES_MCP_SERVER_CHART_DIR)
	@touch $@
