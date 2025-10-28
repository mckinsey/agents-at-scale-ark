# phoenix service build configuration

PHOENIX_SERVICE_NAME := phoenix
PHOENIX_SERVICE_DIR := services/$(PHOENIX_SERVICE_NAME)
PHOENIX_OUT := $(OUT)/$(PHOENIX_SERVICE_NAME)

# Service-specific variables
PHOENIX_NAMESPACE ?= phoenix
PHOENIX_HELM_RELEASE := phoenix
PHOENIX_INTERNAL_ENDPOINT := http://phoenix-svc.$(PHOENIX_NAMESPACE).svc.cluster.local:6006

# Pre-calculate all stamp paths
PHOENIX_STAMP_BUILD := $(PHOENIX_OUT)/stamp-build
PHOENIX_STAMP_INSTALL := $(PHOENIX_OUT)/stamp-install
PHOENIX_STAMP_TEST := $(PHOENIX_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(PHOENIX_OUT)

# Define phony targets
.PHONY: $(PHOENIX_SERVICE_NAME)-build $(PHOENIX_SERVICE_NAME)-install $(PHOENIX_SERVICE_NAME)-uninstall $(PHOENIX_SERVICE_NAME)-test $(PHOENIX_SERVICE_NAME)-dashboard

# Build target (no build needed for Helm chart)
$(PHOENIX_SERVICE_NAME)-build: $(PHOENIX_STAMP_BUILD)
$(PHOENIX_STAMP_BUILD): | $(OUT)
	@mkdir -p $(dir $@)
	@echo "Phoenix uses pre-built images - no build needed"
	@touch $@

# Install target
$(PHOENIX_SERVICE_NAME)-install: $(PHOENIX_STAMP_INSTALL)
$(PHOENIX_STAMP_INSTALL): | $(OUT)
	@mkdir -p $(dir $@)
	cd $(PHOENIX_SERVICE_DIR)/chart && helm dependency update
	helm upgrade --install $(PHOENIX_HELM_RELEASE) $(PHOENIX_SERVICE_DIR)/chart -n $(PHOENIX_NAMESPACE) --create-namespace
	@touch $@

# Uninstall target
$(PHOENIX_SERVICE_NAME)-uninstall: # HELP: Remove Phoenix from cluster
	helm uninstall $(PHOENIX_HELM_RELEASE) -n $(PHOENIX_NAMESPACE) --ignore-not-found
	rm -f $(PHOENIX_STAMP_INSTALL)

# Test target
$(PHOENIX_SERVICE_NAME)-test: $(PHOENIX_STAMP_TEST)
$(PHOENIX_STAMP_TEST): $(PHOENIX_STAMP_BUILD) | $(OUT)
	@mkdir -p $(dir $@)
	@printf '\033[0;31m⚠️  NO TESTS ARE DEFINED for $(PHOENIX_SERVICE_NAME)\033[0m\n'
	@touch $@

# Dashboard target
$(PHOENIX_SERVICE_NAME)-dashboard: # HELP: Start dashboard with port-forward
	@echo "Starting Phoenix dashboard..."
	@echo ""
	@port=6006; \
	while lsof -Pi :$$port -sTCP:LISTEN -t >/dev/null 2>&1; do \
		port=$$((port+1)); \
	done; \
	echo "Dashboard available at: http://localhost:$$port"; \
	echo "Press Ctrl+C to stop"; \
	echo ""; \
	kubectl port-forward -n $(PHOENIX_NAMESPACE) svc/phoenix-svc $$port:6006
