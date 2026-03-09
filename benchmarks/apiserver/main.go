package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
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

func main() {
	var namespace string
	var objectCount int
	var concurrency int
	var kubeconfig string
	var outputPath string

	flag.StringVar(&namespace, "namespace", "", "Namespace (default: current context)")
	flag.IntVar(&objectCount, "objects", 100, "Number of objects to create")
	flag.IntVar(&concurrency, "concurrency", 10, "Number of concurrent workers")
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

	for _, bench := range []struct {
		name string
		fn   func() BenchmarkResult
	}{
		{"create", func() BenchmarkResult { return benchmarkCreate(client, namespace, objectCount, concurrency) }},
		{"get", func() BenchmarkResult { return benchmarkGet(client, namespace, objectCount, concurrency) }},
		{"list", func() BenchmarkResult { return benchmarkList(client, namespace, objectCount, concurrency) }},
		{"watch", func() BenchmarkResult { return benchmarkWatch(client, namespace, concurrency) }},
		{"delete", func() BenchmarkResult { return benchmarkDelete(client, namespace, objectCount, concurrency) }},
	} {
		result := bench.fn()
		suite.Results = append(suite.Results, result)
		printResult(result)
	}

	output, _ := json.MarshalIndent(suite, "", "  ")
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

func runConcurrent(count, concurrency int, op func(idx int) (time.Duration, error)) BenchmarkResult {
	work := make(chan int, count)
	for i := 0; i < count; i++ {
		work <- i
	}
	close(work)

	hists := make([]*hdrhistogram.Histogram, concurrency)
	localErrors := make([]int64, concurrency)
	localCompleted := make([]int64, concurrency)

	start := time.Now()
	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			h := hdrhistogram.New(1, 60000000000, 3)
			for idx := range work {
				latency, err := op(idx)
				if err != nil {
					localErrors[id]++
				} else {
					h.RecordValue(latency.Nanoseconds())
					localCompleted[id]++
				}
			}
			hists[id] = h
		}(w)
	}
	wg.Wait()
	duration := time.Since(start)

	merged := hdrhistogram.New(1, 60000000000, 3)
	var errors, completed int64
	for i := 0; i < concurrency; i++ {
		if hists[i] != nil {
			merged.Merge(hists[i])
		}
		errors += localErrors[i]
		completed += localCompleted[i]
	}

	return BenchmarkResult{
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(merged.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(merged.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(merged.ValueAtQuantile(99)),
		LatencyMean: time.Duration(merged.Mean()),
		Errors:      errors,
	}
}

func benchmarkCreate(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	result := runConcurrent(count, concurrency, func(idx int) (time.Duration, error) {
		obj := makeQuery(namespace, idx)
		opStart := time.Now()
		_, err := client.Resource(queryGVR).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
		return time.Since(opStart), err
	})
	result.Operation = "create"
	return result
}

func benchmarkGet(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	iterations := count * 10
	work := make(chan int, iterations)
	for i := 0; i < iterations; i++ {
		work <- i % count
	}
	close(work)

	hists := make([]*hdrhistogram.Histogram, concurrency)
	localErrors := make([]int64, concurrency)
	localCompleted := make([]int64, concurrency)

	start := time.Now()
	var wg sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			h := hdrhistogram.New(1, 60000000000, 3)
			for idx := range work {
				name := fmt.Sprintf("bench-query-%d", idx)
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
				latency := time.Since(opStart)
				if err != nil {
					localErrors[id]++
				} else {
					h.RecordValue(latency.Nanoseconds())
					localCompleted[id]++
				}
			}
			hists[id] = h
		}(w)
	}
	wg.Wait()
	duration := time.Since(start)

	merged := hdrhistogram.New(1, 60000000000, 3)
	var errors, completed int64
	for i := 0; i < concurrency; i++ {
		if hists[i] != nil {
			merged.Merge(hists[i])
		}
		errors += localErrors[i]
		completed += localCompleted[i]
	}

	return BenchmarkResult{
		Operation:   "get",
		Count:       completed,
		Duration:    duration,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(merged.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(merged.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(merged.ValueAtQuantile(99)),
		LatencyMean: time.Duration(merged.Mean()),
		Errors:      errors,
	}
}

func benchmarkList(client dynamic.Interface, namespace string, count, concurrency int) BenchmarkResult {
	result := runConcurrent(100, concurrency, func(idx int) (time.Duration, error) {
		opStart := time.Now()
		_, err := client.Resource(queryGVR).Namespace(namespace).List(context.Background(), metav1.ListOptions{})
		return time.Since(opStart), err
	})
	result.Operation = "list"
	return result
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
	type timedEvent struct {
		name     string
		received time.Time
	}
	received := make(chan timedEvent, createCount*2)

	go func() {
		for event := range watcher.ResultChan() {
			if event.Type == watch.Added {
				obj, ok := event.Object.(*unstructured.Unstructured)
				if ok {
					received <- timedEvent{name: obj.GetName(), received: time.Now()}
				}
			}
		}
	}()

	time.Sleep(500 * time.Millisecond)

	start := time.Now()
	sendTimes := make(map[string]time.Time, createCount)
	for i := 0; i < createCount; i++ {
		name := fmt.Sprintf("bench-query-%d", 10000+i)
		obj := makeQuery(namespace, 10000+i)
		sendTimes[name] = time.Now()
		_, err := client.Resource(queryGVR).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
		if err != nil {
			atomic.AddInt64(&errors, 1)
		}
	}

	timeout := time.After(10 * time.Second)
	matched := 0
	for matched < createCount {
		select {
		case evt := <-received:
			if sendTime, ok := sendTimes[evt.name]; ok {
				latency := evt.received.Sub(sendTime)
				hist.RecordValue(latency.Nanoseconds())
				atomic.AddInt64(&completed, 1)
				matched++
				delete(sendTimes, evt.name)
			}
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
	result := runConcurrent(count, concurrency, func(idx int) (time.Duration, error) {
		name := fmt.Sprintf("bench-query-%d", idx)
		opStart := time.Now()
		err := client.Resource(queryGVR).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
		return time.Since(opStart), err
	})
	result.Operation = "delete"
	return result
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
