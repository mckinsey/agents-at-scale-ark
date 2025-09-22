include ../../helpers.mk

# Local ark-cluster-memory convenience commands
.DEFAULT_GOAL := help

.PHONY: help build dev test lint install uninstall

help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

build: # build Docker image
	cd ark-cluster-memory && docker build -t ark-cluster-memory:latest .

dev: # run service in development mode
	npm run dev

test: # run tests
	npm test

lint: # run linting and type checking
	npm run lint && npm run type-check

install: # deploy service to cluster (same as make ark-cluster-memory-install)
	cd ../.. && make ark-cluster-memory-install

uninstall: # remove service from cluster (same as make ark-cluster-memory-uninstall)
	cd ../.. && make ark-cluster-memory-uninstall

chainsaw: # Run chainsaw tests
	chainsaw test
