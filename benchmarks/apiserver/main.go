package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	hdrhistogram "github.com/HdrHistogram/hdrhistogram-go"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/watch"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/tools/clientcmd"
)

var queryGVR = schema.GroupVersionResource{
	Group:    "ark.mckinsey.com",
	Version:  "v1alpha1",
	Resource: "queries",
}

var agentGVR = schema.GroupVersionResource{
	Group:    "ark.mckinsey.com",
	Version:  "v1alpha1",
	Resource: "agents",
}

const benchAgentName = "bench-agent"

type BenchmarkResult struct {
	Operation   string        `json:"operation"`
	Count       int64         `json:"count"`
	Duration    time.Duration `json:"duration_ns"`
	Throughput  float64       `json:"throughput_per_sec"`
	LatencyP50  time.Duration `json:"latency_p50_ns"`
	LatencyP95  time.Duration `json:"latency_p95_ns"`
	LatencyP99  time.Duration `json:"latency_p99_ns"`
	LatencyMean time.Duration `json:"latency_mean_ns"`
	Errors      int64         `json:"errors"`
}

type BenchmarkSuite struct {
	Results []BenchmarkResult `json:"results"`
	Config  BenchmarkConfig   `json:"config"`
}

type BenchmarkConfig struct {
	Namespace   string `json:"namespace"`
	ObjectCount int    `json:"object_count"`
	Concurrency int    `json:"concurrency"`
}

type ScalingSuite struct {
	Levels []BenchmarkSuite `json:"levels"`
}

func main() {
	var namespace string
	var objectCount int
	var concurrencyFlag string
	var kubeconfig string
	var outputPath string

	flag.StringVar(&namespace, "namespace", "", "Namespace (default: current context)")
	flag.IntVar(&objectCount, "objects", 100, "Number of objects to create")
	flag.StringVar(&concurrencyFlag, "concurrency", "10", "Concurrency level(s), comma-separated (e.g. 1,2,4)")
	flag.StringVar(&kubeconfig, "kubeconfig", "", "Path to kubeconfig")
	flag.StringVar(&outputPath, "output", "", "Path to write JSON results (default: stdout)")
	flag.Parse()

	client, resolvedNamespace, err := newClient(kubeconfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create client: %v\n", err)
		os.Exit(1)
	}
	if namespace == "" {
		namespace = resolvedNamespace
	}

	levels := parseLevels(concurrencyFlag)

	var result interface{}
	if len(levels) > 1 {
		result = runMultiLevel(client, namespace, objectCount, levels)
	} else {
		result = runLevel(client, namespace, objectCount, levels[0])
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	if outputPath != "" {
		if err := os.WriteFile(outputPath, output, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to write output: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Results written to %s\n", outputPath)
	} else {
		fmt.Println(string(output))
	}
}

func parseLevels(s string) []int {
	parts := strings.Split(s, ",")
	levels := make([]int, 0, len(parts))
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || n < 1 {
			fmt.Fprintf(os.Stderr, "invalid concurrency level: %q\n", p)
			os.Exit(2)
		}
		levels = append(levels, n)
	}
	return levels
}

func runMultiLevel(client dynamic.Interface, namespace string, objectCount int, levels []int) ScalingSuite {
	scaling := ScalingSuite{}
	for _, level := range levels {
		fmt.Printf("\n========== Concurrency level: %d ==========\n", level)
		suite := runLevel(client, namespace, objectCount, level)
		scaling.Levels = append(scaling.Levels, suite)
	}
	return scaling
}

func runLevel(client dynamic.Interface, namespace string, objectCount, concurrency int) BenchmarkSuite {
	suite := BenchmarkSuite{
		Config: BenchmarkConfig{
			Namespace:   namespace,
			ObjectCount: objectCount,
			Concurrency: concurrency,
		},
	}

	fmt.Printf("Running benchmark: %d objects, %d concurrency\n", objectCount, concurrency)

	cleanup(client, namespace)
	ensureBenchAgent(client, namespace)

	createResult := benchmarkCreate(client, namespace, objectCount, concurrency)
	suite.Results = append(suite.Results, createResult)
	printResult(createResult)

	getResult := benchmarkGet(client, namespace, objectCount, concurrency)
	suite.Results = append(suite.Results, getResult)
	printResult(getResult)

	listResult := benchmarkList(client, namespace, objectCount, concurrency)
	suite.Results = append(suite.Results, listResult)
	printResult(listResult)

	watchResult := benchmarkWatch(client, namespace, concurrency)
	suite.Results = append(suite.Results, watchResult)
	printResult(watchResult)

	deleteResult := benchmarkDelete(client, namespace, objectCount, concurrency)
	suite.Results = append(suite.Results, deleteResult)
	printResult(deleteResult)

	return suite
}

func newClient(kubeconfig string) (dynamic.Interface, string, error) {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfig != "" {
		rules.ExplicitPath = kubeconfig
	}
	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		rules, &clientcmd.ConfigOverrides{})

	namespace, _, err := clientConfig.Namespace()
	if err != nil {
		return nil, "", err
	}

	config, err := clientConfig.ClientConfig()
	if err != nil {
		return nil, "", err
	}

	config.QPS = 1000
	config.Burst = 2000

	client, err := dynamic.NewForConfig(config)
	return client, namespace, err
}

func cleanup(client dynamic.Interface, namespace string) {
	ctx := context.Background()
	list, err := client.Resource(queryGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return
	}
	for _, item := range list.Items {
		client.Resource(queryGVR).Namespace(namespace).Delete(ctx, item.GetName(), metav1.DeleteOptions{})
	}
	time.Sleep(time.Second)
}

func benchmarkCreate(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors int64
	var completed int64

	work := make(chan int, count)
	for i := 0; i < count; i++ {
		work <- i
	}
	close(work)

	start := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range work {
				obj := makeQuery(namespace, idx)
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
				latency := time.Since(opStart)
				if err != nil {
					atomic.AddInt64(&errors, 1)
				} else {
					hist.RecordValue(latency.Nanoseconds())
					atomic.AddInt64(&completed, 1)
				}
			}
		}()
	}
	wg.Wait()
	duration := time.Since(start)

	return BenchmarkResult{
		Operation:   "create",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
		Errors:      errors,
	}
}

func benchmarkGet(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors int64
	var completed int64

	iterations := count * 10
	work := make(chan int, iterations)
	for i := 0; i < iterations; i++ {
		work <- i % count
	}
	close(work)

	start := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range work {
				name := fmt.Sprintf("bench-query-%d", idx)
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
				latency := time.Since(opStart)
				if err != nil {
					atomic.AddInt64(&errors, 1)
				} else {
					hist.RecordValue(latency.Nanoseconds())
					atomic.AddInt64(&completed, 1)
				}
			}
		}()
	}
	wg.Wait()
	duration := time.Since(start)

	return BenchmarkResult{
		Operation:   "get",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
		Errors:      errors,
	}
}

func benchmarkList(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors int64
	var completed int64

	iterations := 100
	work := make(chan int, iterations)
	for i := 0; i < iterations; i++ {
		work <- i
	}
	close(work)

	start := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for range work {
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).List(context.Background(), metav1.ListOptions{})
				latency := time.Since(opStart)
				if err != nil {
					atomic.AddInt64(&errors, 1)
				} else {
					hist.RecordValue(latency.Nanoseconds())
					atomic.AddInt64(&completed, 1)
				}
			}
		}()
	}
	wg.Wait()
	duration := time.Since(start)

	return BenchmarkResult{
		Operation:   "list",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
		Errors:      errors,
	}
}

func benchmarkWatch(client dynamic.Interface, namespace string, concurrency int) BenchmarkResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors int64
	var completed int64

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	watcher, err := client.Resource(queryGVR).Namespace(namespace).Watch(ctx, metav1.ListOptions{})
	if err != nil {
		return BenchmarkResult{Operation: "watch", Errors: 1}
	}
	defer watcher.Stop()

	createCount := 50
	received := make(chan time.Time, createCount)

	go func() {
		for event := range watcher.ResultChan() {
			if event.Type == watch.Added || event.Type == watch.Modified {
				received <- time.Now()
			}
		}
	}()

	time.Sleep(500 * time.Millisecond)

	start := time.Now()
	sendTimes := make([]time.Time, createCount)
	for i := 0; i < createCount; i++ {
		obj := makeQuery(namespace, 10000+i)
		sendTimes[i] = time.Now()
		_, err := client.Resource(queryGVR).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
		if err != nil {
			atomic.AddInt64(&errors, 1)
		}
	}

	timeout := time.After(10 * time.Second)
	receivedCount := 0
	for receivedCount < createCount {
		select {
		case recvTime := <-received:
			if receivedCount < len(sendTimes) {
				latency := recvTime.Sub(sendTimes[receivedCount])
				hist.RecordValue(latency.Nanoseconds())
				atomic.AddInt64(&completed, 1)
			}
			receivedCount++
		case <-timeout:
			goto done
		}
	}
done:
	duration := time.Since(start)

	for i := 0; i < createCount; i++ {
		name := fmt.Sprintf("bench-query-%d", 10000+i)
		client.Resource(queryGVR).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
	}

	return BenchmarkResult{
		Operation:   "watch",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
		Errors:      errors,
	}
}

func benchmarkDelete(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors int64
	var completed int64

	work := make(chan int, count)
	for i := 0; i < count; i++ {
		work <- i
	}
	close(work)

	start := time.Now()
	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for idx := range work {
				name := fmt.Sprintf("bench-query-%d", idx)
				opStart := time.Now()
				err := client.Resource(queryGVR).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
				latency := time.Since(opStart)
				if err != nil {
					atomic.AddInt64(&errors, 1)
				} else {
					hist.RecordValue(latency.Nanoseconds())
					atomic.AddInt64(&completed, 1)
				}
			}
		}()
	}
	wg.Wait()
	duration := time.Since(start)

	return BenchmarkResult{
		Operation:   "delete",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
		Errors:      errors,
	}
}

func ensureBenchAgent(client dynamic.Interface, namespace string) {
	ctx := context.Background()
	agent := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "ark.mckinsey.com/v1alpha1",
			"kind":       "Agent",
			"metadata": map[string]interface{}{
				"name":      benchAgentName,
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"description": "Benchmark target agent",
				"modelRef": map[string]interface{}{
					"name": "bench-model",
				},
			},
		},
	}
	_, err := client.Resource(agentGVR).Namespace(namespace).Get(ctx, benchAgentName, metav1.GetOptions{})
	if err != nil {
		_, err = client.Resource(agentGVR).Namespace(namespace).Create(ctx, agent, metav1.CreateOptions{})
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to create benchmark agent: %v\n", err)
			os.Exit(1)
		}
	}
}

func makeQuery(namespace string, idx int) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "ark.mckinsey.com/v1alpha1",
			"kind":       "Query",
			"metadata": map[string]interface{}{
				"name":      fmt.Sprintf("bench-query-%d", idx),
				"namespace": namespace,
			},
			"spec": map[string]interface{}{
				"target": map[string]interface{}{
					"name": benchAgentName,
					"type": "agent",
				},
				"input": map[string]interface{}{
					"type": "user",
					"text": fmt.Sprintf("Benchmark query %d", idx),
				},
			},
		},
	}
}

func printResult(r BenchmarkResult) {
	fmt.Printf("\n=== %s ===\n", r.Operation)
	fmt.Printf("Count:      %d\n", r.Count)
	fmt.Printf("Duration:   %v\n", r.Duration.Round(time.Millisecond))
	fmt.Printf("Throughput: %.2f ops/sec\n", r.Throughput)
	fmt.Printf("Latency P50: %v\n", r.LatencyP50.Round(time.Microsecond))
	fmt.Printf("Latency P95: %v\n", r.LatencyP95.Round(time.Microsecond))
	fmt.Printf("Latency P99: %v\n", r.LatencyP99.Round(time.Microsecond))
	fmt.Printf("Latency Mean: %v\n", r.LatencyMean.Round(time.Microsecond))
	fmt.Printf("Errors:     %d\n", r.Errors)
}
