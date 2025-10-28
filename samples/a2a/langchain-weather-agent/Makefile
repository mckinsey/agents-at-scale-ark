.DEFAULT_GOAL := help

.PHONY: help
help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

.PHONY: init
init: # install dependencies
	python3 -m venv venv
	. venv/bin/activate && pip install -e ".[dev]"

.PHONY: dev
dev: init # run in development mode
	. venv/bin/activate && python -m langchain_weather_agent --host 0.0.0.0

.PHONY: lint
lint: # run linting and type checking
	flake8 src/langchain_weather_agent/
	mypy src/langchain_weather_agent/
	black --check src/langchain_weather_agent/
	isort --check-only src/langchain_weather_agent/

.PHONY: lint-fix
lint-fix: # fix linting issues
	black src/langchain_weather_agent/
	isort src/langchain_weather_agent/

