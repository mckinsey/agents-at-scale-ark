.PHONY: help dev build install deploy check-demo setup-demo port-forwards demo-page stop-port-forwards

help:
	@echo "Available targets:"
	@echo "  make demo-page          - Setup demo + port-forwards + run dev"
	@echo "  make dev                - Run in development mode"
	@echo "  make build              - Build Docker image"
	@echo "  make install            - Install dependencies"
	@echo "  make deploy             - Deploy to ark-system namespace"
	@echo ""
	@echo "Demo setup:"
	@echo "  make check-demo         - Check if demo is deployed"
	@echo "  make setup-demo         - Deploy kyc-demo namespace with dashboard + API"
	@echo "  make port-forwards      - Start port-forwards for demo"
	@echo "  make stop-port-forwards - Stop all port-forwards"

install:
	npm install

dev: install
	PORT=3002 npm run dev

build:
	docker build -t ark-landing-page:latest .

deploy:
	helm install ark-landing-page ./chart -n ark-system --create-namespace

check-demo:
	@kubectl get namespace kyc-demo >/dev/null 2>&1 || \
		(echo "Namespace kyc-demo not found" && exit 1)
	@kubectl get deployment -n kyc-demo ark-dashboard >/dev/null 2>&1 || \
		(echo "ark-dashboard not found in kyc-demo" && exit 1)
	@kubectl get deployment -n kyc-demo ark-api >/dev/null 2>&1 || \
		(echo "ark-api not found in kyc-demo" && exit 1)
	@echo "Demo is deployed"

setup-demo:
	@kubectl get namespace kyc-demo >/dev/null 2>&1 || \
		kubectl apply -f ../../examples/demo-namespaces/kyc-demo.yaml
	@helm upgrade --install ark-dashboard ../ark-dashboard/chart \
		-n kyc-demo \
		--set httpRoute.enabled=true \
		--set "httpRoute.hostnames={kyc-demo.127.0.0.1.nip.io}" \
		--wait --timeout=5m
	@helm upgrade --install ark-api ../ark-api/chart \
		-n kyc-demo \
		--wait --timeout=5m

port-forwards:
	@pkill -f "port-forward.*kyc-demo" 2>/dev/null || true
	@kubectl port-forward -n kyc-demo svc/ark-dashboard 3003:3000 > /dev/null 2>&1 &
	@kubectl port-forward -n kyc-demo svc/ark-api 8000:80 > /dev/null 2>&1 &
	@sleep 2
	@echo "Port-forwards running:"
	@echo "  Dashboard: http://localhost:3003"
	@echo "  API:       http://localhost:8000"

stop-port-forwards:
	@pkill -f "port-forward.*kyc-demo" 2>/dev/null || true

demo-page: install
	@$(MAKE) check-demo 2>/dev/null || $(MAKE) setup-demo
	@$(MAKE) port-forwards
	@echo ""
	@echo "Landing page: http://localhost:3002"
	@echo ""
	@PORT=3002 npm run dev
