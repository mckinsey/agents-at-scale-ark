.PHONY: help dev build install deploy

help:
	@echo "Available targets:"
	@echo "  make dev     - Run in development mode"
	@echo "  make build   - Build Docker image"
	@echo "  make install - Install dependencies"
	@echo "  make deploy  - Deploy to ark-system namespace"

install:
	npm install

dev: install
	npm run dev

build:
	docker build -t ark-landing-page:latest .

deploy:
	helm install ark-landing-page ./chart -n ark-system --create-namespace
