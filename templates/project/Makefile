# Makefile for Agent Project Template
# 
# This Makefile provides commands for building, testing, and deploying
# your agent project to the Agents at Scale platform.

# Load environment variables from .env file if it exists
-include .env
export

# Configuration
PROJECT_NAME ?= {{ .Values.projectName }}
NAMESPACE ?= $(PROJECT_NAME)
CHART_VERSION ?= 0.1.0
IMAGE_TAG ?= latest
REGISTRY ?= localhost:5000

# Helm and kubectl
HELM := helm
KUBECTL := kubectl

# Tool directories
TOOLS_DIR := tools
CHART_DIR := .

# Build output
OUT_DIR := out
DOCKER_BUILD_DIR := $(OUT_DIR)/docker

.PHONY: help
help: ## Show this help message
	@echo "🚀 Quick Commands:"
	@echo "  devspace dev        # Deploy ARK to cluster"
	@echo "  make resources-apply # Apply all custom resources in correct order"
	@echo "  make fix-models     # Fix broken models (if you have query errors)"
	@echo ""
	@echo "📚 All Commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: quickstart
quickstart: ## 5-minute setup and deploy to ARK
	@echo "🚀 Quick Start - Deploying to Agents at Scale..."
	@echo "📋 Checking prerequisites..."
	@if [ -z "$$OPENAI_API_KEY" ] && [ -z "$$AZURE_API_KEY" ] && [ -z "$$AZURE_OPENAI_API_KEY" ]; then echo "❌ Please set OPENAI_API_KEY, AZURE_API_KEY, or AZURE_OPENAI_API_KEY in .env file"; exit 1; fi
	@$(KUBECTL) version --client > /dev/null || (echo "❌ kubectl not found" && exit 1)
	@$(HELM) version > /dev/null || (echo "❌ helm not found" && exit 1)
	@command -v envsubst >/dev/null 2>&1 || (echo "❌ envsubst not found (install gettext package)" && exit 1)
	@echo "✅ Prerequisites check passed"
	@echo "🔐 Creating namespace..."
	@$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | $(KUBECTL) apply -f -
	@echo "🚀 Deploying infrastructure (without custom resources)..."
	@$(MAKE) build install-no-resources
	@echo "🚀 Deploying custom resources in dependency order..."
	@$(MAKE) resources-apply
	@echo "✅ Quick start complete! Your agents are running on Kubernetes."
	@if [ -d queries ] && [ -n "$$(find queries -name "*.yaml" -type f | head -1)" ]; then \
		FIRST_QUERY=$$(find queries -name "*.yaml" -type f | head -1); \
		QUERY_NAME=$$(grep -E "^[[:space:]]*name:" $$FIRST_QUERY | head -1 | sed 's/.*name:[[:space:]]*//'); \
		echo "   Try: fark query $$QUERY_NAME --namespace $(NAMESPACE)"; \
	fi

.PHONY: all
all: build test ## Build and test everything

# Setup and initialization
.PHONY: init
init: ## Initialize project dependencies
	@echo "Initializing project..."
	@mkdir -p $(OUT_DIR) $(DOCKER_BUILD_DIR)
	@if [ -f scripts/setup.sh ]; then ./scripts/setup.sh; fi

.PHONY: clean
clean: ## Clean build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf $(OUT_DIR)
	@docker system prune -f

# Building
.PHONY: build
build: tools-build chart-package ## Build all components

.PHONY: tools-build
tools-build: ## Build all custom tools
	@echo "Building custom tools..."
	@for tool in $(shell find $(TOOLS_DIR) -mindepth 1 -maxdepth 1 -type d -not -name examples); do \
		if [ -f "$$tool/Dockerfile" ]; then \
			echo "Building tool: $$(basename $$tool)"; \
			docker build -t $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG) $$tool; \
		fi; \
	done

.PHONY: chart-package
chart-package: ## Package Helm chart
	@echo "Packaging Helm chart..."
	@$(HELM) package $(CHART_DIR) -d $(OUT_DIR) --version $(CHART_VERSION)

# Testing
.PHONY: test
test: test-lint test-tools test-manifests ## Run all tests

.PHONY: test-lint
test-lint: ## Run linting on YAML files
	@echo "Linting YAML files..."
	@find agents teams queries models -name "*.yaml" -exec yamllint {} \; || true

.PHONY: test-tools
test-tools: ## Test custom tools
	@echo "Testing custom tools..."
	@for tool in $(shell find $(TOOLS_DIR) -mindepth 1 -maxdepth 1 -type d -not -name examples); do \
		if [ -f "$$tool/test.py" ]; then \
			echo "Testing tool: $$(basename $$tool)"; \
			cd $$tool && python test.py; \
		fi; \
	done

.PHONY: test-manifests
test-manifests: ## Validate Kubernetes manifests
	@echo "Validating Kubernetes manifests..."
	@find agents teams queries models -name "*.yaml" -exec $(KUBECTL) apply --dry-run=client -f {} \; || true

.PHONY: test-e2e
test-e2e: ## Run end-to-end tests
	@echo "Running end-to-end tests..."
	@if [ -d tests/e2e ]; then \
		$(KUBECTL) apply -f tests/e2e/; \
		echo "E2E tests applied. Check results with: kubectl get queries -w"; \
	fi

# Development
.PHONY: dev
dev: dev-tools ## Run in development mode
	@echo "Running in development mode..."
	@echo "Use 'make dev-apply' to deploy manifests for testing"

.PHONY: dev-tools
dev-tools: ## Start tools in development mode
	@echo "Starting tools in development mode..."
	@for tool in $(shell find $(TOOLS_DIR) -mindepth 1 -maxdepth 1 -type d -not -name examples); do \
		if [ -f "$$tool/main.py" ]; then \
			echo "Starting tool: $$(basename $$tool) on port $$(( 8000 + $$(basename $$tool | wc -c) ))"; \
			cd $$tool && python main.py --port $$(( 8000 + $$(basename $$tool | wc -c) )) & \
		fi; \
	done

.PHONY: dev-apply
dev-apply: ## Apply manifests for development testing
	@echo "Applying development manifests..."
	@find agents teams queries models -name "*.yaml" -exec $(KUBECTL) apply -f {} \;

.PHONY: dev-clean
dev-clean: ## Clean development resources
	@echo "Cleaning development resources..."
	@find agents teams queries models -name "*.yaml" -exec $(KUBECTL) delete -f {} \; || true

# Deployment
.PHONY: install
install: check-env build ## Deploy to ARK cluster
	@echo "Deploying to ARK cluster..."
	@$(HELM) upgrade --install $(PROJECT_NAME) $(CHART_DIR) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set image.tag=$(IMAGE_TAG) \
		--set project.name=$(PROJECT_NAME) \
		--wait

.PHONY: install-no-resources
install-no-resources: check-env build ## Deploy to ARK cluster without custom resources (resources handled separately)
	@echo "Deploying to ARK cluster (excluding custom resources)..."
	@$(HELM) upgrade --install $(PROJECT_NAME) $(CHART_DIR) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set image.tag=$(IMAGE_TAG) \
		--set project.name=$(PROJECT_NAME) \
		--set excludeResources=true \
		--wait

.PHONY: uninstall
uninstall: ## Remove from ARK cluster
	@echo "Removing from ARK cluster..."
	@$(HELM) uninstall $(PROJECT_NAME) --namespace $(NAMESPACE) || true

.PHONY: upgrade
upgrade: build ## Upgrade deployment
	@echo "Upgrading deployment..."
	@$(HELM) upgrade $(PROJECT_NAME) $(CHART_DIR) \
		--namespace $(NAMESPACE) \
		--set image.tag=$(IMAGE_TAG) \
		--set project.name=$(PROJECT_NAME) \
		--wait

.PHONY: status
status: ## Check deployment status
	@echo "Deployment status:"
	@$(HELM) status $(PROJECT_NAME) --namespace $(NAMESPACE) || echo "Not deployed"
	@echo "\nResources:"
	@$(KUBECTL) get agents,teams,queries,models,mcpservers -n $(NAMESPACE) -l project=$(PROJECT_NAME) || true

# Image management
.PHONY: images-push
images-push: tools-build ## Push images to registry
	@echo "Pushing images to registry..."
	@for tool in $(shell find $(TOOLS_DIR) -mindepth 1 -maxdepth 1 -type d -not -name examples); do \
		if [ -f "$$tool/Dockerfile" ]; then \
			echo "Pushing: $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG)"; \
			docker push $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG); \
		fi; \
	done

.PHONY: images-load
images-load: tools-build ## Load images into local cluster (kind/minikube)
	@echo "Loading images into local cluster..."
	@for tool in $(shell find $(TOOLS_DIR) -mindepth 1 -maxdepth 1 -type d -not -name examples); do \
		if [ -f "$$tool/Dockerfile" ]; then \
			echo "Loading: $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG)"; \
			kind load docker-image $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG) || \
			minikube image load $(REGISTRY)/$(PROJECT_NAME)-$$(basename $$tool):$(IMAGE_TAG) || \
			echo "Could not load image (not using kind or minikube?)"; \
		fi; \
	done

# Utilities
.PHONY: check-env
check-env: ## Check required environment variables
	@echo "Checking environment..."
	@if [ -z "$$OPENAI_API_KEY" ] && [ -z "$$AZURE_API_KEY" ] && [ -z "$$AZURE_OPENAI_API_KEY" ] && [ -z "$$ANTHROPIC_API_KEY" ]; then \
		echo "Warning: No model API keys set. Set at least one of:"; \
		echo "  AZURE_API_KEY, OPENAI_API_KEY, AZURE_OPENAI_API_KEY, ANTHROPIC_API_KEY"; \
		echo "  (preferably in .env file)"; \
	fi
	@$(KUBECTL) version --client > /dev/null || (echo "Error: kubectl not found" && exit 1)
	@$(HELM) version > /dev/null || (echo "Error: helm not found" && exit 1)
	@command -v envsubst >/dev/null 2>&1 || (echo "Warning: envsubst not found (install gettext package for .env substitution)")

.PHONY: models-apply
models-apply: ## Apply model configurations with environment variable substitution (requires .env file)
	@echo "Applying models with environment variable substitution..."
	@echo "ℹ️  This substitutes environment variables like \$$AZURE_BASE_URL, \$$AZURE_API_VERSION from .env file"
	@for model_file in models/*.yaml; do \
		if [ -f "$$model_file" ]; then \
			echo "Applying $$model_file..."; \
			envsubst < "$$model_file" | $(KUBECTL) apply -f - --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "✅ Models applied successfully. Any existing queries will need to be recreated to use the updated models."

.PHONY: models-delete
models-delete: ## Delete model configurations
	@echo "Deleting model configurations..."
	@for model_file in models/*.yaml; do \
		if [ -f "$$model_file" ]; then \
			echo "Deleting resources from $$model_file..."; \
			envsubst < "$$model_file" | $(KUBECTL) delete -f - --namespace=$(NAMESPACE) || true; \
		fi; \
	done

.PHONY: fix-models
fix-models: ## Fix models with proper environment variable substitution and restart queries
	@echo "🔧 Fixing model configurations..."
	@$(MAKE) models-apply
	@echo "🔄 Restarting any existing queries to use updated models..."
	@$(KUBECTL) get queries -n $(NAMESPACE) --no-headers -o custom-columns=NAME:.metadata.name 2>/dev/null | xargs -r -I {} $(KUBECTL) delete query {} -n $(NAMESPACE) --ignore-not-found=true || true
	@echo "✅ Models fixed! You can now recreate your queries and they should work properly."

.PHONY: resources-apply
resources-apply: ## Apply all custom resources in dependency order (models → mcp-servers → tools → agents → teams → queries)
	@echo "🚀 Applying custom resources in dependency order..."
	@echo "📋 Step 1: Applying models with environment substitution..."
	@for model_file in models/*.yaml; do \
		if [ -f "$$model_file" ]; then \
			echo "Applying $$model_file..."; \
			envsubst < "$$model_file" | $(KUBECTL) apply -f - --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "📋 Step 2: Applying MCP servers with environment substitution..."
	@for mcp_file in mcp-servers/*.yaml; do \
		if [ -f "$$mcp_file" ]; then \
			echo "Applying $$mcp_file..."; \
			envsubst < "$$mcp_file" | $(KUBECTL) apply -f - --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "📋 Step 3: Applying tools with environment substitution..."
	@for tool_file in tools/*.yaml; do \
		if [ -f "$$tool_file" ]; then \
			echo "Applying $$tool_file..."; \
			envsubst < "$$tool_file" | $(KUBECTL) apply -f - --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "📋 Step 4: Applying agents..."
	@for agent_file in agents/*.yaml; do \
		if [ -f "$$agent_file" ]; then \
			echo "Applying $$agent_file..."; \
			$(KUBECTL) apply -f "$$agent_file" --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "📋 Step 5: Applying teams..."
	@for team_file in teams/*.yaml; do \
		if [ -f "$$team_file" ]; then \
			echo "Applying $$team_file..."; \
			$(KUBECTL) apply -f "$$team_file" --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "📋 Step 6: Applying queries..."
	@for query_file in queries/*.yaml; do \
		if [ -f "$$query_file" ]; then \
			echo "Applying $$query_file..."; \
			$(KUBECTL) apply -f "$$query_file" --namespace=$(NAMESPACE); \
		fi; \
	done
	@echo "✅ All custom resources applied successfully in dependency order."

.PHONY: logs
logs: ## Show logs from deployed components
	@echo "Showing logs..."
	@$(KUBECTL) logs -l project=$(PROJECT_NAME) -n $(NAMESPACE) --tail=100 -f

.PHONY: shell
shell: ## Open shell in a tool pod
	@echo "Opening shell in tool pod..."
	@$(KUBECTL) exec -it -n $(NAMESPACE) $$($(KUBECTL) get pods -l project=$(PROJECT_NAME) -n $(NAMESPACE) -o jsonpath='{.items[0].metadata.name}') -- /bin/bash

.PHONY: port-forward
port-forward: ## Forward ports for local development
	@echo "Setting up port forwarding..."
	@$(KUBECTL) port-forward -n $(NAMESPACE) svc/$(PROJECT_NAME)-tools 8000:8000 &
	@echo "Tools available at http://localhost:8000"

# Documentation
.PHONY: docs
docs: ## Generate documentation
	@echo "Generating documentation..."
	@if [ -f scripts/generate-docs.sh ]; then ./scripts/generate-docs.sh; fi

.PHONY: examples
examples: ## Deploy example configurations
	@echo "Deploying examples..."
	@find agents teams queries models -name "*.yaml" -exec $(KUBECTL) apply -f {} \;

# Monitoring and debugging
.PHONY: debug
debug: ## Show debugging information
	@echo "=== Debugging Information ==="
	@echo "Project: $(PROJECT_NAME)"
	@echo "Namespace: $(NAMESPACE)"
	@echo "Chart Version: $(CHART_VERSION)"
	@echo "Image Tag: $(IMAGE_TAG)"
	@echo ""
	@echo "=== Kubernetes Resources ==="
	@$(KUBECTL) get agents,teams,queries,models,mcpservers -n $(NAMESPACE) || true
	@echo ""
	@echo "=== Recent Events ==="
	@$(KUBECTL) get events -n $(NAMESPACE) --sort-by='.lastTimestamp' | tail -10 || true

.PHONY: validate
validate: ## Validate all configurations
	@echo "Validating configurations..."
	@$(HELM) lint $(CHART_DIR)
	@find agents teams queries models -name "*.yaml" -exec $(KUBECTL) apply --dry-run=server -f {} \;

# Include custom makefiles if they exist
-include Makefile.local
-include scripts/Makefile.custom