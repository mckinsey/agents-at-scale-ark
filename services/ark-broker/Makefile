include ../../helpers.mk

# Local ark-broker convenience commands
.DEFAULT_GOAL := help

.PHONY: help build dev test lint install uninstall db-migrate-up db-migrate-down db-migrate-version db-migrate-create check-migrate

help: # show help for each of the Makefile recipes
	@grep -E '^[a-zA-Z0-9 -]+:.*#'  Makefile | sort | while read -r l; do printf "\033[1;32m$$(echo $$l | cut -f 1 -d':')\033[00m:$$(echo $$l | cut -f 2- -d'#')\n"; done

build: # build Docker image
	cd ark-broker && docker build -t ark-broker:latest .

dev: # run service in development mode
	cd ark-broker && npm run dev

test: # run tests
	cd ark-broker && npm test

lint: # run linting and type checking
	cd ark-broker && npm run lint && npm run type-check && npm run format:check

install: # deploy service to cluster (same as make ark-broker-install)
	cd ../.. && make ark-broker-install

uninstall: # remove service from cluster (same as make ark-broker-uninstall)
	cd ../.. && make ark-broker-uninstall

chainsaw: # Run chainsaw tests
	chainsaw test

check-migrate:
	@command -v migrate >/dev/null 2>&1 || { echo "Error: 'migrate' CLI not found in PATH. Install it from https://github.com/golang-migrate/migrate"; exit 1; }

db-migrate-up: check-migrate # apply all pending migrations (requires DATABASE_URL)
	migrate -path ark-broker/src/db/migrations -database "$(DATABASE_URL)" up

db-migrate-down: check-migrate # roll back the last migration (requires DATABASE_URL)
	migrate -path ark-broker/src/db/migrations -database "$(DATABASE_URL)" down 1

db-migrate-version: check-migrate # print current migration version (requires DATABASE_URL)
	migrate -path ark-broker/src/db/migrations -database "$(DATABASE_URL)" version

db-migrate-create: check-migrate # create a new migration pair — usage: make db-migrate-create NAME=add_index
	migrate create -ext sql -dir ark-broker/src/db/migrations -seq $(NAME)
