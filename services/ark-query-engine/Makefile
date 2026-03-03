.DEFAULT_GOAL := help

BINARY_NAME := ark-query-engine
IMAGE_NAME := ark-query-engine

.PHONY: help build build-binary test lint dev clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

build-binary: ## Build Go binary locally
	go build -o bin/$(BINARY_NAME) ./cmd/

build: ## Build Docker image
	docker build -t $(IMAGE_NAME):latest .

test: ## Run tests with coverage
	go test ./... -coverprofile=coverage.out -v

lint: ## Run linting
	go vet ./...

dev: ## Run locally
	go run ./cmd/

clean: ## Clean build artifacts
	rm -rf bin/ coverage.out
