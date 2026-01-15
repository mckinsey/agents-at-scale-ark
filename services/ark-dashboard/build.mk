# ark-dashboard service build configuration

ARK_DASHBOARD_SERVICE_NAME := ark-dashboard
ARK_DASHBOARD_SERVICE_DIR := services/$(ARK_DASHBOARD_SERVICE_NAME)
ARK_DASHBOARD_SERVICE_SOURCE_DIR := $(ARK_DASHBOARD_SERVICE_DIR)/ark-dashboard
ARK_DASHBOARD_OUT := $(OUT)/$(ARK_DASHBOARD_SERVICE_NAME)

# Service-specific variables
DASHBOARD_IMAGE := ark-dashboard
DASHBOARD_TAG ?= latest
DASHBOARD_NAMESPACE ?= default
DASHBOARD_OPENAPI := $(ARK_DASHBOARD_OUT)/openapi.json

# Pre-calculate all stamp paths
ARK_DASHBOARD_STAMP_DEPS := $(ARK_DASHBOARD_OUT)/stamp-deps
ARK_DASHBOARD_STAMP_TEST := $(ARK_DASHBOARD_OUT)/stamp-test
ARK_DASHBOARD_STAMP_BUILD := $(ARK_DASHBOARD_OUT)/stamp-build
ARK_DASHBOARD_STAMP_INSTALL := $(ARK_DASHBOARD_OUT)/stamp-install

# Add install stamp to global install targets
INSTALL_TARGETS += $(ARK_DASHBOARD_STAMP_INSTALL)

CLEAN_TARGETS += $(ARK_DASHBOARD_OUT)
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_DIR)/out
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/node_modules
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/ark-dashboard/node_modules
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/.next
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/coverage
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/dist
CLEAN_TARGETS += $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/out

# Cross-service dependency: ARK API OpenAPI specification file
ARK_API_OPENAPI := services/ark-api/openapi.json
ARK_API_STAMP_TEST := $(OUT)/ark-api/stamp-test

# Define phony targets
.PHONY: $(ARK_DASHBOARD_SERVICE_NAME)-build $(ARK_DASHBOARD_SERVICE_NAME)-install $(ARK_DASHBOARD_SERVICE_NAME)-uninstall $(ARK_DASHBOARD_SERVICE_NAME)-dev $(ARK_DASHBOARD_SERVICE_NAME)-test $(ARK_DASHBOARD_SERVICE_NAME)-clean-stamps

# Generate clean-stamps target
$(eval $(call CLEAN_STAMPS_TEMPLATE,$(ARK_DASHBOARD_SERVICE_NAME)))

# OpenAPI dependency: Copy ARK API's OpenAPI specification to dashboard build directories
# Prerequisites:
# 1. ARK API tests must complete successfully (generates fresh openapi.json)
# 2. The actual openapi.json file must exist
$(DASHBOARD_OPENAPI): $(ARK_API_STAMP_TEST) $(ARK_API_OPENAPI) | $(OUT)
	@mkdir -p $(ARK_DASHBOARD_SERVICE_DIR)/out
	@mkdir -p $(dir $@)
	cp $(ARK_API_OPENAPI) $(ARK_DASHBOARD_SERVICE_DIR)/out/openapi.json
	cp $(ARK_API_OPENAPI) $@

# Dependencies: Install ARK Dashboard dependencies and generate TypeScript types
$(ARK_DASHBOARD_SERVICE_NAME)-deps: $(ARK_DASHBOARD_STAMP_DEPS) # HELP: Install ARK Dashboard dependencies
$(ARK_DASHBOARD_STAMP_DEPS): $(ARK_DASHBOARD_SERVICE_SOURCE_DIR)/package.json $(DASHBOARD_OPENAPI) | $(OUT)
	@mkdir -p $(dir $@)
	cd $(ARK_DASHBOARD_SERVICE_SOURCE_DIR) && npm ci && npm run generate:api
	@touch $@

# Test target
$(ARK_DASHBOARD_SERVICE_NAME)-test: $(ARK_DASHBOARD_STAMP_TEST) # HELP: Run ARK Dashboard UI tests
$(ARK_DASHBOARD_STAMP_TEST): $(ARK_DASHBOARD_STAMP_DEPS) # This command will fail if any critical vulnerabilities are identified
	cd $(ARK_DASHBOARD_SERVICE_SOURCE_DIR) && npm audit --audit-level=critical && npm run test -- --coverage
	@touch $@

# Build target
$(ARK_DASHBOARD_SERVICE_NAME)-build: $(ARK_DASHBOARD_STAMP_BUILD) # HELP: Build ARK Dashboard UI Docker image
$(ARK_DASHBOARD_STAMP_BUILD): $(ARK_DASHBOARD_STAMP_TEST)
	cd $(ARK_DASHBOARD_SERVICE_DIR) && docker build -t $(DASHBOARD_IMAGE):$(DASHBOARD_TAG) .
	@touch $@

# Install target
$(ARK_DASHBOARD_SERVICE_NAME)-install: $(ARK_DASHBOARD_STAMP_INSTALL) # HELP: Deploy ARK Dashboard UI to cluster
$(ARK_DASHBOARD_STAMP_INSTALL): $(ARK_DASHBOARD_STAMP_BUILD) $$(ARK_API_STAMP_INSTALL) $$(LOCALHOST_GATEWAY_STAMP_INSTALL)
	@echo "Installing ark-dashboard..."
	./scripts/build-and-push.sh -i $(DASHBOARD_IMAGE) -t $(DASHBOARD_TAG) -f $(ARK_DASHBOARD_SERVICE_DIR)/Dockerfile -c $(ARK_DASHBOARD_SERVICE_DIR)
	helm upgrade --install $(ARK_DASHBOARD_SERVICE_NAME) $(ARK_DASHBOARD_SERVICE_DIR)/chart \
		--namespace $(DASHBOARD_NAMESPACE) \
		--create-namespace \
		--set app.image.repository=$(DASHBOARD_IMAGE) \
		--set app.image.tag=$(DASHBOARD_TAG) \
		--set httpRoute.enabled=true \
		--wait \
		--timeout=5m
	@echo "ark-dashboard installed successfully"
	@echo ""
	@echo "Dashboard hostnames (use with localhost-gateway port):"
	@kubectl get httproute localhost-gateway-routes -n default --no-headers -o custom-columns="HOSTNAMES:.spec.hostnames" 2>/dev/null | tr ',' '\n' | sed 's/^[[:space:]]*/  /' || echo "  Routes not found"
	@touch $@

# Uninstall target
$(ARK_DASHBOARD_SERVICE_NAME)-uninstall: # HELP: Remove ARK Dashboard UI from cluster
	@echo "Uninstalling ark-dashboard..."
	helm uninstall $(ARK_DASHBOARD_SERVICE_NAME) -n $(DASHBOARD_NAMESPACE) --ignore-not-found
	@echo "ark-dashboard uninstalled"
	rm -f $(ARK_DASHBOARD_STAMP_INSTALL)

# Dev target
$(ARK_DASHBOARD_SERVICE_NAME)-dev: $(ARK_DASHBOARD_STAMP_DEPS) # HELP: Run ARK Dashboard UI in development mode
	cd $(ARK_DASHBOARD_SERVICE_SOURCE_DIR) && npm run dev

