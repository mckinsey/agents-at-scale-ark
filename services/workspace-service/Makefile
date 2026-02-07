include ../../helpers.mk

.DEFAULT_GOAL := help

.PHONY: help build dev test install uninstall

help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

build: # build Docker image
	docker build -t workspace-service:latest .

dev: # run service in development mode
	go run ./cmd/main.go

test: # run tests
	go test ./... -v

install: # deploy service to cluster
	cd ../.. && make workspace-service-install

uninstall: # remove service from cluster
	cd ../.. && make workspace-service-uninstall
