.DEFAULT_GOAL := help

CHART_NAME = localhost-gateway
NAMESPACE ?= ark-system  # Default to ark-system, can be overridden
PORT ?= 8080  # Port for localhost access, can be overridden

.PHONY: help
help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: install
install: # install localhost-gateway with Gateway API CRDs and nginx-gateway-fabric
	# ARK installs Gateway API CRDs by default, this is normally a no-op
	@echo "Installing Gateway API CRDs..."
	@kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.3.0/standard-install.yaml
	@echo "Updating helm dependencies..."
	@helm dependency build ./chart
	@echo "Installing nginx-gateway-fabric CRDs from chart dependency..."
	@CRD_TMP=$$(mktemp -d); \
		tar -xzf ./chart/charts/nginx-gateway-fabric-*.tgz -C "$$CRD_TMP" nginx-gateway-fabric/crds; \
		kubectl apply -f "$$CRD_TMP/nginx-gateway-fabric/crds/"; \
		rm -rf "$$CRD_TMP"
	@echo "Installing localhost-gateway..."
	@kubectl create namespace $(NAMESPACE) --dry-run=client -o yaml | kubectl apply -f -
	@helm upgrade --install $(CHART_NAME) ./chart \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--set localhost.port=$(PORT) \
		--wait \
		--timeout=10m
	@echo "localhost-gateway installed successfully"
	@echo "Waiting for gateway to be ready..."
	@timeout=60; while [ $$timeout -gt 0 ]; do \
		if kubectl get gateway localhost-gateway -n $(NAMESPACE) -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}' 2>/dev/null | grep -q "True"; then \
			echo "Gateway is ready"; \
			break; \
		fi; \
		echo "Gateway not ready yet, waiting..."; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done; \
	if [ $$timeout -le 0 ]; then \
		echo "Timeout waiting for gateway to be ready"; \
		exit 1; \
	fi
	@echo "Starting port-forwarding on localhost:$(PORT)..."
	@pkill -f "kubectl.*port-forward.*$(PORT):80" || true
	@sleep 2
	@if [ $(PORT) -lt 1024 ]; then \
		echo "Note: Port $(PORT) requires sudo privileges"; \
		sudo -v; \
		sudo kubectl port-forward -n $(NAMESPACE) service/localhost-gateway-nginx $(PORT):80 >/dev/null 2>&1 & \
	else \
		kubectl port-forward -n $(NAMESPACE) service/localhost-gateway-nginx $(PORT):80 > /dev/null 2>&1 & \
	fi
	@sleep 2
	@echo "Services will be accessible at:"
	@echo "  http://<service>.<namespace>.127.0.0.1.nip.io:$(PORT)/"
	@echo ""
	@echo "Use 'make routes' to see available routes"

.PHONY: routes
routes: # show available routes and their URLs
	@NAMESPACE=$(NAMESPACE) PORT=$(PORT) ./scripts/show-routes.sh

.PHONY: uninstall
uninstall: # remove localhost-gateway and nginx-gateway-fabric CRDs
	@echo "Stopping port-forwarding..."
	@pkill -f "kubectl.*port-forward.*$(PORT):80" || true
	@echo "Uninstalling localhost-gateway..."
	@helm uninstall $(CHART_NAME) -n $(NAMESPACE) 2>/dev/null || echo "Chart not installed or already removed"
	@echo "Removing nginx-gateway-fabric CRDs..."
	@CRDS=$$(kubectl get crd -o name 2>/dev/null | grep '\.gateway\.nginx\.org$$' || true); \
		if [ -n "$$CRDS" ]; then echo "$$CRDS" | xargs kubectl delete; else echo "nginx-gateway-fabric CRDs not found or already removed"; fi
	@echo "localhost-gateway uninstalled"

.PHONY: status
status: # show status of localhost-gateway installation including chart info and annotations
	@helm list -n $(NAMESPACE) -f "$(CHART_NAME)|nginx-gateway-fabric"
	@helm get metadata $(CHART_NAME) -n $(NAMESPACE)
