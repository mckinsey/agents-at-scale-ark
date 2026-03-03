.PHONY: build run help

help:
	@echo "my-execution-engine"
	@echo ""
	@echo "  make build   Build the binary"
	@echo "  make run     Run the engine"

build:
	go build -o my-engine ./cmd/

run: build
	./my-engine
