# langfuse service build configuration

LANGFUSE_SERVICE_NAME := langfuse
LANGFUSE_SERVICE_DIR := services/$(LANGFUSE_SERVICE_NAME)
LANGFUSE_OUT := $(OUT)/$(LANGFUSE_SERVICE_NAME)

# Service-specific variables
LANGFUSE_NAMESPACE ?= telemetry
LANGFUSE_HELM_RELEASE := langfuse
LANGFUSE_PUBLIC_KEY ?= lf_pk_1234567890
LANGFUSE_SECRET_KEY ?= lf_sk_1234567890
LANGFUSE_INTERNAL_ENDPOINT := http://langfuse-web.$(LANGFUSE_NAMESPACE).svc.cluster.local:3000

# Pre-calculate all stamp paths
LANGFUSE_STAMP_BUILD := $(LANGFUSE_OUT)/stamp-build
LANGFUSE_STAMP_INSTALL := $(LANGFUSE_OUT)/stamp-install
LANGFUSE_STAMP_TEST := $(LANGFUSE_OUT)/stamp-test

# Add service output directory to clean targets
CLEAN_TARGETS += $(LANGFUSE_OUT)

# Define phony targets
.PHONY: $(LANGFUSE_SERVICE_NAME)-build $(LANGFUSE_SERVICE_NAME)-install $(LANGFUSE_SERVICE_NAME)-uninstall $(LANGFUSE_SERVICE_NAME)-test $(LANGFUSE_SERVICE_NAME)-deploy-otel-headers $(LANGFUSE_SERVICE_NAME)-credentials $(LANGFUSE_SERVICE_NAME)-dashboard

# Build target (no build needed for Helm chart)
$(LANGFUSE_SERVICE_NAME)-build: $(LANGFUSE_STAMP_BUILD)
$(LANGFUSE_STAMP_BUILD): | $(OUT)
	@mkdir -p $(dir $@)
	@echo "Langfuse uses pre-built images - no build needed"
	@touch $@

# Deploy OTEL headers to all namespaces
$(LANGFUSE_SERVICE_NAME)-deploy-otel-headers: # HELP: Deploy OTEL authentication secrets to all namespaces
	@LANGFUSE_PUBLIC_KEY=$(LANGFUSE_PUBLIC_KEY) \
		LANGFUSE_SECRET_KEY=$(LANGFUSE_SECRET_KEY) \
		LANGFUSE_ENDPOINT=$(LANGFUSE_INTERNAL_ENDPOINT) \
		LANGFUSE_DEPLOYMENT=langfuse-web \
		LANGFUSE_NAMESPACE=$(LANGFUSE_NAMESPACE) \
		$(LANGFUSE_SERVICE_DIR)/scripts/deploy-otel-headers.sh

# Install target
$(LANGFUSE_SERVICE_NAME)-install: $(LANGFUSE_STAMP_INSTALL)
$(LANGFUSE_STAMP_INSTALL): | $(OUT)
	@mkdir -p $(dir $@)
	helm repo add langfuse https://langfuse.github.io/langfuse-k8s || true
	cd $(LANGFUSE_SERVICE_DIR)/chart && helm dependency update
	helm upgrade --install $(LANGFUSE_HELM_RELEASE) $(LANGFUSE_SERVICE_DIR)/chart -n $(LANGFUSE_NAMESPACE) --create-namespace \
		--set demo.project.publicKey=$(LANGFUSE_PUBLIC_KEY) \
		--set demo.project.secretKey=$(LANGFUSE_SECRET_KEY)
	$(MAKE) $(LANGFUSE_SERVICE_NAME)-deploy-otel-headers
	@touch $@

# Uninstall target
$(LANGFUSE_SERVICE_NAME)-uninstall: # HELP: Remove Langfuse from cluster
	helm uninstall $(LANGFUSE_HELM_RELEASE) -n $(LANGFUSE_NAMESPACE) --ignore-not-found
	kubectl delete secret otel-environment-variables -n ark-system --ignore-not-found=true
	rm -f $(LANGFUSE_STAMP_INSTALL)

# Test target
$(LANGFUSE_SERVICE_NAME)-test: $(LANGFUSE_STAMP_TEST)
$(LANGFUSE_STAMP_TEST): $(LANGFUSE_STAMP_BUILD) | $(OUT)
	@mkdir -p $(dir $@)
	@printf '\033[0;31m⚠️  NO TESTS ARE DEFINED for $(LANGFUSE_SERVICE_NAME)\033[0m\n'
	@touch $@

# Credentials target
$(LANGFUSE_SERVICE_NAME)-credentials: # HELP: Show Langfuse login credentials
	@echo "Username: ark@ark.com"
	@echo "Password: password123"
	@echo ""
	@echo "To access the dashboard, run:"
	@echo "  make langfuse-dashboard"

# Dashboard target
$(LANGFUSE_SERVICE_NAME)-dashboard: # HELP: Start dashboard with port-forward and show credentials
	@echo "Starting Langfuse dashboard..."
	@echo ""
	@echo "Username: ark@ark.com"
	@echo "Password: password123"
	@echo ""
	@port=3000; \
	while lsof -Pi :$$port -sTCP:LISTEN -t >/dev/null 2>&1; do \
		port=$$((port+1)); \
	done; \
	echo "Dashboard available at: http://localhost:$$port"; \
	echo "Press Ctrl+C to stop"; \
	echo ""; \
	kubectl port-forward service/langfuse-web $$port:3000 -n $(LANGFUSE_NAMESPACE)
