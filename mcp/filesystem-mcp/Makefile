# Filesystem MCP Server Makefile

# Variables
IMAGE_NAME ?= filesystem-mcp-server
IMAGE_TAG ?= latest
TARGET_CLUSTER ?= auto
HELM_RELEASE_NAME ?= filesystem-mcp

# Docker image build
.PHONY: build
build:
	@echo "Building Filesystem MCP Server Docker image..."
	./build.sh $(IMAGE_TAG) $(TARGET_CLUSTER)

# Install using Helm
.PHONY: install
install:
	@echo "Installing Filesystem MCP Server with Helm..."
	helm install $(HELM_RELEASE_NAME) ./chart

# Install with values file
.PHONY: install-with-values
install-with-values:
	@echo "Installing Filesystem MCP Server with values file..."
	@if [ -z "$(VALUES_FILE)" ]; then \
		echo "Error: VALUES_FILE is required"; \
		echo "Usage: make install-with-values VALUES_FILE=values.yaml"; \
		exit 1; \
	fi
	helm install $(HELM_RELEASE_NAME) ./chart \
		--values $(VALUES_FILE)

# Upgrade using Helm
.PHONY: upgrade
upgrade:
	@echo "Upgrading Filesystem MCP Server with Helm..."
	@if [ -n "$(VALUES_FILE)" ]; then \
		helm upgrade $(HELM_RELEASE_NAME) ./chart \
			--values $(VALUES_FILE); \
	else \
		helm upgrade $(HELM_RELEASE_NAME) ./chart; \
	fi

# Uninstall using Helm
.PHONY: uninstall
uninstall:
	@echo "Uninstalling Filesystem MCP Server..."
	helm uninstall $(HELM_RELEASE_NAME) --ignore-not-found

# Show status
.PHONY: status
status:
	@echo "Checking Filesystem MCP Server status..."
	kubectl get pods -l app.kubernetes.io/name=mcp-filesystem
	kubectl get services -l app.kubernetes.io/name=mcp-filesystem
	kubectl get persistentvolumeclaims -l app.kubernetes.io/name=mcp-filesystem

# Show logs
.PHONY: logs
logs:
	@echo "Showing Filesystem MCP Server logs..."
	kubectl logs -l app.kubernetes.io/name=mcp-filesystem --tail=100 -f

# Test deployment
.PHONY: test
test:
	@echo "Testing Filesystem MCP Server deployment..."
	kubectl get pods -l app.kubernetes.io/name=mcp-filesystem

# Run chainsaw tests
.PHONY: test-chainsaw
test-chainsaw:
	@echo "Running chainsaw tests for MCP Filesystem Server..."
	chainsaw test test/

# Port forward to MCP server (for local access)
.PHONY: port-forward
port-forward:
	@echo "Port forwarding MCP Server to localhost:8080..."
	kubectl port-forward service/mcp-filesystem-server 8080:8080

# Help
.PHONY: help
help:
	@echo "Filesystem MCP Server Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  build               Build Docker image"
	@echo "  install             Install server using Helm"
	@echo "  install-with-values Install server using values file (requires VALUES_FILE)"
	@echo "  upgrade             Upgrade server using Helm"
	@echo "  uninstall           Uninstall server"
	@echo "  status              Show server status"
	@echo "  logs                Show MCP server logs"
	@echo "  test                Test deployment"
	@echo "  test-chainsaw       Run chainsaw integration tests"
	@echo "  port-forward        Port forward MCP server to localhost:8080"
	@echo "  help                Show this help"
	@echo ""
	@echo "Variables:"
	@echo "  IMAGE_NAME=filesystem-mcp-server   Docker image name"
	@echo "  IMAGE_TAG=latest                   Docker image tag"
	@echo "  TARGET_CLUSTER=auto                Target cluster for image push"
	@echo "  HELM_RELEASE_NAME=filesystem-mcp   Helm release name"
	@echo "  VALUES_FILE=<file>              Helm values file (for install-with-values)"
	@echo ""
	@echo "Examples:"
	@echo "  make install"
	@echo "  make install-with-values VALUES_FILE=values.yaml"
	@echo "  make port-forward  # Access MCP server at http://localhost:8080"