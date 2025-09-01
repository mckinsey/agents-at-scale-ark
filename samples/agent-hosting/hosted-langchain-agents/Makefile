.DEFAULT_GOAL := help

.PHONY: help
help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: init
init: # install dependencies
	uv sync

.PHONY: dev
dev: init # run in development mode
	uv run python -m hosted_langchain_agents --host 0.0.0.0

.PHONY: test
test: # run unit tests
	uv run pytest --cov=hosted_langchain_agents --cov-report=term-missing src/tests/

.PHONY: test-e2e
test-e2e: build # run e2e test
	chainsaw test test/chainsaw-test.yaml --test-dir test/

.PHONY: lint
lint: # run linting and type checking
	uv run flake8 src/hosted_langchain_agents/
	uv run mypy src/hosted_langchain_agents/
	uv run black --check src/hosted_langchain_agents/
	uv run isort --check-only src/hosted_langchain_agents/

.PHONY: lint-fix
lint-fix: # fix linting issues
	uv run black src/hosted_langchain_agents/
	uv run isort src/hosted_langchain_agents/

.PHONY: build
build: # build container
	../../../scripts/build-and-push.sh -i hosted-langchain-agents

.PHONY: install
install: build # build and deploy
	@sh -c ' \
			set -a; \
			if [ -f .env ]; then . ./.env; fi; \
			set +a; \
			[ -n "$$AZURE_OPENAI_API_KEY" ] || { echo "Error: AZURE_OPENAI_API_KEY not set"; exit 1; }; \
			[ -n "$$AZURE_API_BASE" ] || { echo "Error: AZURE_API_BASE not set"; exit 1; }; \
			kubectl create secret generic langchain-azure-openai-secret \
				--from-literal=token="$$AZURE_OPENAI_API_KEY" \
				--from-literal=base-url="$$AZURE_API_BASE" \
				--namespace="$${NAMESPACE:-default}" \
				--dry-run=client -o yaml | kubectl apply -f -; \
			helm upgrade --install hosted-langchain-agents chart/ \
				--namespace="$${NAMESPACE:-default}" \
				--wait --timeout=60s; \
		'

.PHONY: uninstall
uninstall: # remove resources
	helm uninstall hosted-langchain-agents --ignore-not-found
	kubectl delete secret langchain-azure-openai-secret --ignore-not-found

status: # show status
	@kubectl get a2aserver hosted-langchain-agents -o yaml 2>/dev/null || echo "A2AServer not found"
	@kubectl get agents -l a2a/server=hosted-langchain-agents 2>/dev/null || echo "No agents found"