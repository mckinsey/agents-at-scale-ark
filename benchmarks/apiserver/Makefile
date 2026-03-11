.PHONY: build clean run

build:
	go build -o apiserver-bench .

clean:
	rm -f apiserver-bench

run: build
	./apiserver-bench -objects 100 -output results-100.json
