.PHONY: help dev build install deploy check-demo setup-demo port-forwards demo-page stop-port-forwards build-images deploy-production-demo

help:
	@echo "Available targets:"
	@echo "  make demo-page          - Build images, setup demo, port-forwards, run dev"
	@echo "  make dev                - Run in development mode"
	@echo "  make build              - Build Docker image"
	@echo "  make install            - Install dependencies"
	@echo "  make deploy             - Deploy to ark-system namespace"
	@echo ""
	@echo "Demo setup:"
	@echo "  make build-images       - Build and load Docker images into Minikube"
	@echo "  make check-demo         - Check if demo is deployed"
	@echo "  make setup-demo         - Deploy kyc-demo namespace with dashboard + API"
	@echo "  make port-forwards      - Start port-forwards for demo"
	@echo "  make stop-port-forwards - Stop all port-forwards"
	@echo ""
	@echo "Production deployment:"
	@echo "  make deploy-production-demo - Deploy kyc-demo with custom domains"
	@echo "      GATEWAY_NAME=<name>       (default: localhost-gateway)"
	@echo "      GATEWAY_NAMESPACE=<ns>    (default: ark-system)"
	@echo "      IMAGE_TAG=<tag>           (default: latest)"

install:
	npm install

dev: install
	PORT=3002 npm run dev

build:
	docker build -t ark-landing-page:latest .

deploy:
	helm install ark-landing-page ./chart -n ark-system --create-namespace

build-images:
	@echo "Building ark-dashboard..."
	docker build -t ark-dashboard:local ../ark-dashboard
	@echo "Building ark-api..."
	docker build -t ark-api:local ../ark-api
	@echo "Loading images into Minikube..."
	minikube image load ark-dashboard:local
	minikube image load ark-api:local
	@echo "Images ready."

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
		--set app.image.repository=ark-dashboard \
		--set app.image.tag=local \
		--set app.image.pullPolicy=Never \
		--set httpRoute.enabled=true \
		--set "httpRoute.hostnames={kyc-demo.127.0.0.1.nip.io}" \
		--wait --timeout=5m
	@helm upgrade --install ark-api ../ark-api/chart \
		-n kyc-demo \
		--set app.image.repository=ark-api \
		--set app.image.tag=local \
		--set app.image.pullPolicy=Never \
		-f ./kyc-demo-values.yaml \
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

demo-page: install build-images
	@$(MAKE) setup-demo
	@$(MAKE) port-forwards
	@echo ""
	@echo "Landing page: http://localhost:3002"
	@echo ""
	@PORT=3002 npm run dev

GATEWAY_NAME ?= localhost-gateway
GATEWAY_NAMESPACE ?= ark-system
IMAGE_TAG ?= latest

deploy-production-demo:
	@echo "Deploying kyc-demo namespace..."
	@echo "  Landing page service will be available at: https://demo.dev.agents-at-scale.com"
	@echo "  Dashboard service will be available at: https://dashboard-demo.dev.agents-at-scale.com"
	@echo ""
	@kubectl get namespace kyc-demo >/dev/null 2>&1 || \
		kubectl apply -f ../../examples/demo-namespaces/kyc-demo.yaml
	@echo "Deploying ark-dashboard..."
	@helm upgrade --install ark-dashboard ../ark-dashboard/chart \
		-n kyc-demo \
		--set app.image.tag=$(IMAGE_TAG) \
		--wait --timeout=5m
	@echo "Deploying ark-api..."
	@helm upgrade --install ark-api ../ark-api/chart \
		-n kyc-demo \
		--set app.image.tag=$(IMAGE_TAG) \
		-f ./kyc-demo-values.yaml \
		--wait --timeout=5m
	@echo "Deploying ark-landing-page..."
	@helm upgrade --install ark-landing-page ./chart \
		-n kyc-demo \
		--set app.image.tag=$(IMAGE_TAG) \
		-f ./kyc-demo-production-values.yaml \
		--wait --timeout=5m
	@echo ""
	@echo "Deployment complete!"
	@echo ""
	@echo "Services deployed to kyc-demo namespace:"
	@echo "  - ark-dashboard (port 3000)"
	@echo "  - ark-api (port 80)"
	@echo "  - ark-landing-page (port 3000)"
	@echo ""
	@echo "Configure your routing to:"
	@echo "  - demo.dev.agents-at-scale.com -> ark-landing-page:3000"
	@echo "  - dashboard-demo.dev.agents-at-scale.com -> ark-dashboard:3000"
