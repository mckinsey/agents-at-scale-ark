OBJECTS ?= 100
CONCURRENCY ?= 1,2,4
TARGETS ?= targets.default.yaml

.PHONY: build clean run gate

build:
	go build -o apiserver-bench .
	go build -o benchmark-gate ./cmd/gate/

clean:
	rm -f apiserver-bench benchmark-gate

run: build
	./apiserver-bench \
		-concurrency $(CONCURRENCY) \
		-objects $(OBJECTS) \
		-output results.json

gate: build
	./benchmark-gate \
		-results results.json \
		-targets $(TARGETS)
