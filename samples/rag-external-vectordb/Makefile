.PHONY: help rag-demo rag-deploy-db rag-deploy-service rag-ingest rag-deploy-agent rag-clean rag-verify-ark rag-configure-azure rag-open-dashboard rag-test rag-status

# Default target
.DEFAULT_GOAL := help

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)RAG External Vector Database - Setup Commands$(NC)"
	@echo ""
	@echo "Quick start:"
	@echo "  1. Edit retrieval-service/deployment/azure-openai-secret.yaml with your credentials"
	@echo "  2. Run: $(YELLOW)make rag-demo$(NC)"
	@echo ""
	@echo "Main commands:"
	@echo "  make rag-demo            - Complete RAG demo setup"
	@echo "  make rag-test            - Test the RAG agent"
	@echo "  make rag-status          - Check status of all components"
	@echo "  make rag-clean           - Remove all deployed resources"
	@echo "  make rag-open-dashboard  - Open ARK dashboard"
	@echo ""
	@echo "Individual setup steps:"
	@echo "  make rag-verify-ark      - Check ARK is running"
	@echo "  make rag-configure-azure - Apply Azure OpenAI credentials from YAML"
	@echo "  make rag-deploy-db       - Deploy pgvector database"
	@echo "  make rag-deploy-service  - Build and deploy retrieval service"
	@echo "  make rag-ingest          - Ingest sample data"
	@echo "  make rag-deploy-agent    - Deploy RAG agent and tools"
	@echo ""
	@echo "Prerequisites:"
	@echo "  - ARK platform running (devspace dev or ark install)"
	@echo "  - Azure OpenAI credentials configured in azure-openai-secret.yaml"
	@echo "  - Docker for building images"

rag-demo: rag-verify-ark rag-configure-azure rag-deploy-db rag-deploy-service rag-ingest rag-deploy-agent ## Complete RAG demo setup
	@echo ""
	@echo "$(GREEN)✅ RAG demo setup complete!$(NC)"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Open ARK dashboard: $(YELLOW)make rag-open-dashboard$(NC)"
	@echo "  2. Test the agent: $(YELLOW)make rag-test$(NC)"
	@echo ""
	@echo "Or manually:"
	@echo "  kubectl apply -f queries/rag-query.yaml"
	@echo "  kubectl get query rag-query -o jsonpath='{.status.response.content}'"

rag-verify-ark: ## Verify ARK platform is running
	@echo "$(YELLOW)Checking ARK platform...$(NC)"
	@kubectl get pods -n ark-system 2>/dev/null || (echo "$(RED)❌ ARK is not running. Start with: devspace dev$(NC)" && exit 1)
	@kubectl get models 2>/dev/null || (echo "$(RED)❌ No models configured$(NC)" && exit 1)
	@echo "$(GREEN)✅ ARK is running$(NC)"

rag-configure-azure: ## Configure Azure OpenAI credentials
	@echo "$(YELLOW)Configuring Azure OpenAI credentials...$(NC)"
	@echo "Applying secret from retrieval-service/deployment/azure-openai-secret.yaml"
	@if ! grep -q "your-api-key" retrieval-service/deployment/azure-openai-secret.yaml 2>/dev/null; then \
		kubectl apply -f retrieval-service/deployment/azure-openai-secret.yaml; \
		echo "$(GREEN)✅ Azure OpenAI credentials configured$(NC)"; \
	else \
		echo "$(RED)❌ Please edit retrieval-service/deployment/azure-openai-secret.yaml with your credentials$(NC)"; \
		echo ""; \
		echo "Update the following fields:"; \
		echo "  - api-key: Your Azure OpenAI API key"; \
		echo "  - endpoint: Your Azure OpenAI endpoint URL"; \
		echo "  - api-version: API version (default: 2024-04-01-preview)"; \
		echo "  - embedding-model: Model name (default: text-embedding-ada-002)"; \
		echo ""; \
		exit 1; \
	fi

rag-deploy-db: ## Deploy pgvector database
	@echo "$(YELLOW)Deploying pgvector database...$(NC)"
	@kubectl apply -k pgvector/
	@echo "Waiting for pgvector to be ready..."
	@kubectl wait --for=condition=ready pod -l app=pgvector --timeout=120s || (echo "$(RED)❌ pgvector failed to start$(NC)" && exit 1)
	@echo "$(GREEN)✅ pgvector deployed and ready$(NC)"

rag-deploy-service: ## Build and deploy retrieval service
	@echo "$(YELLOW)Building retrieval service Docker image...$(NC)"
	@cd retrieval-service && docker build -t rag-retrieval-http:azure-openai . --quiet
	@echo "$(YELLOW)Loading image into cluster...$(NC)"
	@if command -v minikube >/dev/null 2>&1 && minikube status >/dev/null 2>&1; then \
		minikube image load rag-retrieval-http:azure-openai; \
	elif command -v kind >/dev/null 2>&1; then \
		kind load docker-image rag-retrieval-http:azure-openai; \
	fi
	@echo "$(YELLOW)Deploying retrieval service...$(NC)"
	@kubectl apply -k retrieval-service/deployment/
	@echo "Waiting for retrieval service to be ready..."
	@kubectl wait --for=condition=ready pod -l app=rag-retrieval-http --timeout=120s || (echo "$(RED)❌ Retrieval service failed to start$(NC)" && kubectl logs -l app=rag-retrieval-http --tail=20 && exit 1)
	@echo "$(GREEN)✅ Retrieval service deployed$(NC)"

rag-ingest: ## Ingest sample data into pgvector
	@echo "$(YELLOW)Ingesting sample data...$(NC)"
	@echo "Exporting Azure OpenAI credentials from secret..."
	@export AZURE_OPENAI_API_KEY=$$(kubectl get secret azure-openai-creds -o jsonpath='{.data.api-key}' | base64 -d) && \
		export AZURE_OPENAI_ENDPOINT=$$(kubectl get secret azure-openai-creds -o jsonpath='{.data.endpoint}' | base64 -d) && \
		export AZURE_OPENAI_API_VERSION=$$(kubectl get secret azure-openai-creds -o jsonpath='{.data.api-version}' | base64 -d) && \
		export AZURE_EMBEDDING_MODEL=$$(kubectl get secret azure-openai-creds -o jsonpath='{.data.embedding-model}' | base64 -d) && \
		echo "Port-forwarding pgvector..." && \
		kubectl port-forward svc/pgvector 5432:5432 >/dev/null 2>&1 & \
		PF_PID=$$!; \
		sleep 3; \
		cd ingestion && \
		pip install -q -r requirements.txt && \
		python ingest_sample_data.py || (kill $$PF_PID 2>/dev/null; exit 1); \
		kill $$PF_PID 2>/dev/null || true
	@echo "$(GREEN)✅ Sample data ingested (12 documents)$(NC)"

rag-deploy-agent: ## Deploy ARK tools and RAG agent
	@echo "$(YELLOW)Deploying ARK HTTP Tools...$(NC)"
	@kubectl apply -f tools/
	@echo "$(YELLOW)Deploying RAG agent...$(NC)"
	@kubectl apply -f agents/rag-agent.yaml
	@sleep 2
	@kubectl get tools
	@kubectl get agents
	@echo "$(GREEN)✅ RAG agent and tools deployed$(NC)"

rag-test: ## Test the RAG agent with a sample query
	@echo "$(YELLOW)Testing RAG agent...$(NC)"
	@kubectl delete query rag-query 2>/dev/null || true
	@kubectl apply -f queries/rag-query.yaml
	@echo "Waiting for query to complete..."
	@sleep 15
	@echo ""
	@echo "$(GREEN)Query Response:$(NC)"
	@kubectl get query rag-query -o jsonpath='{.status.response.content}' | fold -w 80 -s
	@echo ""
	@echo ""
	@echo "$(GREEN)✅ Test complete$(NC)"
	@echo ""
	@echo "View in dashboard: $(YELLOW)make rag-open-dashboard$(NC)"

rag-open-dashboard: ## Open ARK dashboard in browser
	@echo "$(YELLOW)Opening ARK dashboard...$(NC)"
	@if command -v open >/dev/null 2>&1; then \
		open http://localhost:8080; \
	elif command -v xdg-open >/dev/null 2>&1; then \
		xdg-open http://localhost:8080; \
	else \
		echo "Open http://localhost:8080 in your browser"; \
	fi

rag-clean: ## Remove all deployed resources
	@echo "$(YELLOW)Cleaning up RAG resources...$(NC)"
	@kubectl delete -f queries/ --ignore-not-found=true
	@kubectl delete -f agents/ --ignore-not-found=true
	@kubectl delete -f tools/ --ignore-not-found=true
	@kubectl delete -k retrieval-service/deployment/ --ignore-not-found=true
	@kubectl delete -k pgvector/ --ignore-not-found=true
	@kubectl delete secret azure-openai-creds --ignore-not-found=true
	@echo "$(GREEN)✅ Cleanup complete$(NC)"

# Status check
rag-status: ## Check status of all components
	@echo "$(GREEN)=== ARK Platform ===$(NC)"
	@kubectl get pods -n ark-system 2>/dev/null || echo "Not running"
	@echo ""
	@echo "$(GREEN)=== pgvector Database ===$(NC)"
	@kubectl get pods -l app=pgvector 2>/dev/null || echo "Not deployed"
	@echo ""
	@echo "$(GREEN)=== Retrieval Service ===$(NC)"
	@kubectl get pods -l app=rag-retrieval-http 2>/dev/null || echo "Not deployed"
	@echo ""
	@echo "$(GREEN)=== ARK Resources ===$(NC)"
	@kubectl get tools,agents,queries 2>/dev/null || echo "None deployed"

