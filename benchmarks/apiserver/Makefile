KUBECONFIG ?= $(HOME)/.kube/config
NAMESPACE ?= ark-benchmark
OBJECTS ?= 100,1000
CONCURRENCY ?= 10
SCENARIOS ?= all
CHART_PATH ?= ../../ark/dist/chart
IMAGE_TAG ?= $(shell helm get values ark-controller -n ark-system -o json 2>/dev/null | grep -o '"tag":"[^"]*"' | cut -d'"' -f4)
OUTPUT_DIR ?= results

.PHONY: build clean run run-etcd run-postgres run-comparison help

help:
	@echo "Ark API Server Benchmark"
	@echo ""
	@echo "Targets:"
	@echo "  build           Build benchmark binaries"
	@echo "  run             Run against current cluster mode"
	@echo "  run-etcd        Deploy etcd mode and benchmark"
	@echo "  run-postgres    Deploy PostgreSQL mode and benchmark"
	@echo "  run-comparison  Run both modes and compare"
	@echo "  clean           Remove built binaries"
	@echo ""
	@echo "Variables:"
	@echo "  KUBECONFIG      Path to kubeconfig (default: ~/.kube/config)"
	@echo "  NAMESPACE       Benchmark namespace (default: ark-benchmark)"
	@echo "  OBJECTS         Comma-separated object counts (default: 100,1000)"
	@echo "  CONCURRENCY     Worker count (default: 10)"
	@echo "  SCENARIOS       Production scenarios: all|concurrent|watch-density|mixed|saturation (default: all)"
	@echo "  IMAGE_TAG       Controller image tag (default: auto-detect from helm)"
	@echo "  OUTPUT_DIR      Results directory (default: results)"

build:
	go build -o apiserver-bench .
	go build -o production-bench ./cmd/production/

clean:
	rm -f apiserver-bench production-bench

run: build
	./run.sh --mode auto --kubeconfig $(KUBECONFIG) --namespace $(NAMESPACE) \
		--objects $(OBJECTS) --concurrency $(CONCURRENCY) --scenarios $(SCENARIOS) \
		--output-dir $(OUTPUT_DIR)

run-etcd: build
	./run.sh --mode etcd --kubeconfig $(KUBECONFIG) --namespace $(NAMESPACE) \
		--objects $(OBJECTS) --concurrency $(CONCURRENCY) --scenarios $(SCENARIOS) \
		--chart-path $(CHART_PATH) --image-tag $(IMAGE_TAG) --output-dir $(OUTPUT_DIR)

run-postgres: build
	./run.sh --mode postgres --kubeconfig $(KUBECONFIG) --namespace $(NAMESPACE) \
		--objects $(OBJECTS) --concurrency $(CONCURRENCY) --scenarios $(SCENARIOS) \
		--chart-path $(CHART_PATH) --image-tag $(IMAGE_TAG) --output-dir $(OUTPUT_DIR)

run-comparison: build
	./run.sh --mode both --kubeconfig $(KUBECONFIG) --namespace $(NAMESPACE) \
		--objects $(OBJECTS) --concurrency $(CONCURRENCY) --scenarios $(SCENARIOS) \
		--chart-path $(CHART_PATH) --image-tag $(IMAGE_TAG) --output-dir $(OUTPUT_DIR)
