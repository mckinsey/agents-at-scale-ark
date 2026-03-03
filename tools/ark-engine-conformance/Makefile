.PHONY: build install help

help:
	@echo "ark-engine-conformance - Execution engine conformance test runner"
	@echo ""
	@echo "  make build     Build the binary"
	@echo "  make install   Install to ~/.local/bin"

build:
	go build -o ark-engine-conformance .

install: build
	mkdir -p ~/.local/bin
	cp ark-engine-conformance ~/.local/bin/
