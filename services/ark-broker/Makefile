include ../../helpers.mk

# Local ark-broker convenience commands
.DEFAULT_GOAL := help

.PHONY: help build dev test lint install uninstall

help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

build: # build Docker image
	cd ark-broker && docker build -t ark-broker:latest .

dev: # run service in development mode
	npm run dev

test: # run tests
	npm test

lint: # run linting and type checking
	npm run lint && npm run type-check

install: # deploy service to cluster (same as make ark-broker-install)
	cd ../.. && make ark-broker-install

uninstall: # remove service from cluster (same as make ark-broker-uninstall)
	cd ../.. && make ark-broker-uninstall

chainsaw: # Run chainsaw tests
	chainsaw test
