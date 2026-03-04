package main

import (
	"context"
	"flag"
	"fmt"
	"math/rand"
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
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"golang.org/x/time/rate"
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

type ScenarioResult struct {
	Scenario    string                   `json:"scenario"`
	Config      map[string]interface{}   `json:"config"`
	Results     []OperationResult        `json:"results"`
	TotalTime   time.Duration            `json:"total_time_ns"`
	Summary     string                   `json:"summary"`
}

type OperationResult struct {
	Operation   string        `json:"operation"`
	Count       int64         `json:"count"`
	Errors      int64         `json:"errors"`
	Throughput  float64       `json:"throughput_per_sec"`
	LatencyP50  time.Duration `json:"latency_p50_ns"`
	LatencyP95  time.Duration `json:"latency_p95_ns"`
	LatencyP99  time.Duration `json:"latency_p99_ns"`
	LatencyMean time.Duration `json:"latency_mean_ns"`
}

func main() {
	var namespace string
	var kubeconfig string
	var scenario string

	flag.StringVar(&namespace, "namespace", "ark-benchmark", "Namespace for benchmark")
	flag.StringVar(&kubeconfig, "kubeconfig", "", "Path to kubeconfig")
	flag.StringVar(&scenario, "scenario", "all", "Scenario: concurrent|watch-density|mixed|saturation|all")
	flag.Parse()

	client, err := newProdClient(kubeconfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create client: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("🚀 Ark Production Benchmark Suite")
	fmt.Println("==================================")

	cleanupAll(client, namespace)
	ensureBenchAgent(client, namespace)

	switch scenario {
	case "concurrent":
		runConcurrentScaling(client, namespace)
	case "watch-density":
		runWatchDensity(client, namespace)
	case "mixed":
		runMixedWorkload(client, namespace)
	case "saturation":
		runSaturationTest(client, namespace)
	case "all":
		runConcurrentScaling(client, namespace)
		cleanupAll(client, namespace)
		runWatchDensity(client, namespace)
		cleanupAll(client, namespace)
		runMixedWorkload(client, namespace)
		cleanupAll(client, namespace)
		runSaturationTest(client, namespace)
	default:
		fmt.Fprintf(os.Stderr, "Unknown scenario: %s\n", scenario)
		os.Exit(1)
	}

	cleanupAll(client, namespace)
	fmt.Println("\n✅ Benchmark complete")
}

func newProdClient(kubeconfig string) (dynamic.Interface, error) {
	var config *rest.Config
	var err error

	if kubeconfig != "" {
		config, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	} else {
		config, err = rest.InClusterConfig()
	}
	if err != nil {
		return nil, err
	}

	config.QPS = 2000
	config.Burst = 4000

	return dynamic.NewForConfig(config)
}

var testRunID = time.Now().UnixNano()

func cleanupAll(client dynamic.Interface, namespace string) {
	ctx := context.Background()
	for {
		list, err := client.Resource(queryGVR).Namespace(namespace).List(ctx, metav1.ListOptions{Limit: 500})
		if err != nil || list == nil || len(list.Items) == 0 {
			break
		}
		var wg sync.WaitGroup
		for _, item := range list.Items {
			wg.Add(1)
			name := item.GetName()
			go func(n string) {
				defer wg.Done()
				client.Resource(queryGVR).Namespace(namespace).Delete(ctx, n, metav1.DeleteOptions{})
			}(name)
		}
		wg.Wait()
		time.Sleep(500 * time.Millisecond)
	}
	testRunID = time.Now().UnixNano()
	time.Sleep(3 * time.Second)
}

func runConcurrentScaling(client dynamic.Interface, namespace string) {
	fmt.Println("\n📊 Scenario 1: Concurrent Query Processing")
	fmt.Println("-------------------------------------------")
	fmt.Println("Testing throughput at increasing concurrency levels")

	concurrencyLevels := []int{10, 50, 100, 200, 500}
	objectsPerLevel := 1000

	for _, concurrency := range concurrencyLevels {
		fmt.Printf("\n🔄 Testing concurrency=%d...\n", concurrency)

		cleanupAll(client, namespace)
		result := benchmarkAtConcurrency(client, namespace, objectsPerLevel, concurrency)

		fmt.Printf("   Create: %.1f ops/sec, P50=%v, P99=%v, errors=%d\n",
			result.Throughput, result.LatencyP50.Round(time.Millisecond),
			result.LatencyP99.Round(time.Millisecond), result.Errors)

		if result.Errors > int64(objectsPerLevel/10) {
			fmt.Printf("   ⚠️  High error rate (%.1f%%) - likely at saturation\n",
				float64(result.Errors)/float64(objectsPerLevel)*100)
		}
	}
}

func benchmarkAtConcurrency(client dynamic.Interface, namespace string, count, concurrency int) OperationResult {
	hist := hdrhistogram.New(1, 60000000000, 3)
	var errors, completed int64

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
				obj := makeProdQuery(namespace, idx)
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).Create(
					context.Background(), obj, metav1.CreateOptions{})
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

	return OperationResult{
		Operation:   "create",
		Count:       completed,
		Errors:      errors,
		Throughput:  float64(completed) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
	}
}

func runWatchDensity(client dynamic.Interface, namespace string) {
	fmt.Println("\n📊 Scenario 2: Watch Connection Density")
	fmt.Println("---------------------------------------")
	fmt.Println("Testing event delivery with multiple concurrent watchers")

	watcherCounts := []int{1, 10, 50, 100, 200}
	eventsPerTest := 100

	for _, watcherCount := range watcherCounts {
		fmt.Printf("\n🔄 Testing watchers=%d...\n", watcherCount)

		cleanupAll(client, namespace)
		result := benchmarkWatchDensity(client, namespace, watcherCount, eventsPerTest)

		fmt.Printf("   Fan-out: %.1f events/sec, P50=%v, P99=%v\n",
			result.Throughput, result.LatencyP50.Round(time.Millisecond),
			result.LatencyP99.Round(time.Millisecond))
		fmt.Printf("   Memory estimate: ~%dKB for %d watchers\n",
			watcherCount*5, watcherCount)
	}
}

func benchmarkWatchDensity(client dynamic.Interface, namespace string, watcherCount, eventCount int) OperationResult {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	watchers := make([]watch.Interface, 0, watcherCount)
	receivedCounts := make([]int64, watcherCount)
	latencies := make([]*hdrhistogram.Histogram, watcherCount)

	for i := 0; i < watcherCount; i++ {
		w, err := client.Resource(queryGVR).Namespace(namespace).Watch(ctx, metav1.ListOptions{})
		if err != nil {
			fmt.Printf("   ⚠️  Failed to create watcher %d: %v\n", i, err)
			continue
		}
		watchers = append(watchers, w)
		latencies[i] = hdrhistogram.New(1, 60000000000, 3)
	}

	var wg sync.WaitGroup
	sendTimes := make([]time.Time, eventCount)
	var sendMu sync.Mutex

	for i, w := range watchers {
		wg.Add(1)
		go func(idx int, watcher watch.Interface) {
			defer wg.Done()
			for event := range watcher.ResultChan() {
				if event.Type == watch.Added {
					recvTime := time.Now()
					sendMu.Lock()
					count := atomic.LoadInt64(&receivedCounts[idx])
					if count < int64(eventCount) && sendTimes[count].UnixNano() > 0 {
						latency := recvTime.Sub(sendTimes[count])
						latencies[idx].RecordValue(latency.Nanoseconds())
					}
					sendMu.Unlock()
					atomic.AddInt64(&receivedCounts[idx], 1)
				}
			}
		}(i, w)
	}

	time.Sleep(500 * time.Millisecond)

	start := time.Now()
	for i := 0; i < eventCount; i++ {
		sendMu.Lock()
		sendTimes[i] = time.Now()
		sendMu.Unlock()

		obj := makeProdQuery(namespace, 50000+i)
		client.Resource(queryGVR).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
		time.Sleep(10 * time.Millisecond)
	}

	time.Sleep(5 * time.Second)
	for _, w := range watchers {
		w.Stop()
	}

	duration := time.Since(start)

	combinedHist := hdrhistogram.New(1, 60000000000, 3)
	var totalReceived int64
	for i := range watchers {
		totalReceived += atomic.LoadInt64(&receivedCounts[i])
		if latencies[i] != nil {
			combinedHist.Merge(latencies[i])
		}
	}

	return OperationResult{
		Operation:   fmt.Sprintf("watch-fanout-%d", watcherCount),
		Count:       totalReceived,
		Throughput:  float64(totalReceived) / duration.Seconds(),
		LatencyP50:  time.Duration(combinedHist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(combinedHist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(combinedHist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(combinedHist.Mean()),
	}
}

func runMixedWorkload(client dynamic.Interface, namespace string) {
	fmt.Println("\n📊 Scenario 3: Mixed Workload Simulation")
	fmt.Println("----------------------------------------")
	fmt.Println("Production-like traffic: 60% create, 20% get, 10% list, 10% delete")

	duration := 60 * time.Second
	targetOpsPerSec := 100

	fmt.Printf("\n🔄 Running for %v at ~%d ops/sec...\n", duration, targetOpsPerSec)

	createRatio := 0.60
	getRatio := 0.20
	listRatio := 0.10

	ctx, cancel := context.WithTimeout(context.Background(), duration+10*time.Second)
	defer cancel()

	createLimiter := rate.NewLimiter(rate.Limit(float64(targetOpsPerSec)*createRatio), 10)
	getLimiter := rate.NewLimiter(rate.Limit(float64(targetOpsPerSec)*getRatio), 10)
	listLimiter := rate.NewLimiter(rate.Limit(float64(targetOpsPerSec)*listRatio), 5)
	deleteLimiter := rate.NewLimiter(rate.Limit(float64(targetOpsPerSec)*(1-createRatio-getRatio-listRatio)), 5)

	histCreate := hdrhistogram.New(1, 60000000000, 3)
	histGet := hdrhistogram.New(1, 60000000000, 3)
	histList := hdrhistogram.New(1, 60000000000, 3)
	histDelete := hdrhistogram.New(1, 60000000000, 3)

	var createCount, getCount, listCount, deleteCount int64
	var createErr, getErr, listErr, deleteErr int64
	var objectIndex int64
	var deletableObjects sync.Map

	var wg sync.WaitGroup
	startTime := time.Now()
	endTime := startTime.Add(duration)

	wg.Add(1)
	go func() {
		defer wg.Done()
		for time.Now().Before(endTime) {
			if err := createLimiter.Wait(ctx); err != nil {
				return
			}
			idx := atomic.AddInt64(&objectIndex, 1)
			obj := makeProdQuery(namespace, int(idx))
			opStart := time.Now()
			_, err := client.Resource(queryGVR).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
			if err == nil {
				histCreate.RecordValue(time.Since(opStart).Nanoseconds())
				atomic.AddInt64(&createCount, 1)
				deletableObjects.Store(idx, true)
			} else {
				atomic.AddInt64(&createErr, 1)
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for time.Now().Before(endTime) {
			if err := getLimiter.Wait(ctx); err != nil {
				return
			}
			maxIdx := atomic.LoadInt64(&objectIndex)
			if maxIdx <= 0 {
				continue
			}
			idx := rand.Int63n(maxIdx) + 1
			name := fmt.Sprintf("pq-%d-%d", testRunID%1000000, idx)
			opStart := time.Now()
			_, err := client.Resource(queryGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
			if err == nil {
				histGet.RecordValue(time.Since(opStart).Nanoseconds())
				atomic.AddInt64(&getCount, 1)
			} else {
				atomic.AddInt64(&getErr, 1)
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for time.Now().Before(endTime) {
			if err := listLimiter.Wait(ctx); err != nil {
				return
			}
			opStart := time.Now()
			_, err := client.Resource(queryGVR).Namespace(namespace).List(ctx, metav1.ListOptions{Limit: 100})
			if err == nil {
				histList.RecordValue(time.Since(opStart).Nanoseconds())
				atomic.AddInt64(&listCount, 1)
			} else {
				atomic.AddInt64(&listErr, 1)
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for time.Now().Before(endTime) {
			if err := deleteLimiter.Wait(ctx); err != nil {
				return
			}
			var deleteIdx int64 = -1
			deletableObjects.Range(func(key, _ interface{}) bool {
				deleteIdx = key.(int64)
				deletableObjects.Delete(key)
				return false
			})
			if deleteIdx < 0 {
				continue
			}
			name := fmt.Sprintf("pq-%d-%d", testRunID%1000000, deleteIdx)
			opStart := time.Now()
			err := client.Resource(queryGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
			if err == nil {
				histDelete.RecordValue(time.Since(opStart).Nanoseconds())
				atomic.AddInt64(&deleteCount, 1)
			} else {
				atomic.AddInt64(&deleteErr, 1)
			}
		}
	}()

	wg.Wait()
	totalDuration := time.Since(startTime)

	fmt.Printf("\n   Results over %v:\n", totalDuration.Round(time.Second))
	printOpResult("Create", createCount, createErr, histCreate, totalDuration)
	printOpResult("Get", getCount, getErr, histGet, totalDuration)
	printOpResult("List", listCount, listErr, histList, totalDuration)
	printOpResult("Delete", deleteCount, deleteErr, histDelete, totalDuration)

	totalOps := createCount + getCount + listCount + deleteCount
	fmt.Printf("\n   Total: %d ops, %.1f ops/sec\n", totalOps, float64(totalOps)/totalDuration.Seconds())
}

func printOpResult(name string, count, errors int64, hist *hdrhistogram.Histogram, duration time.Duration) {
	if count == 0 {
		fmt.Printf("   %s: 0 ops\n", name)
		return
	}
	fmt.Printf("   %s: %d ops (%.1f/s), P50=%v, P99=%v, errors=%d\n",
		name, count, float64(count)/duration.Seconds(),
		time.Duration(hist.ValueAtQuantile(50)).Round(time.Millisecond),
		time.Duration(hist.ValueAtQuantile(99)).Round(time.Millisecond),
		errors)
}

func runSaturationTest(client dynamic.Interface, namespace string) {
	fmt.Println("\n📊 Scenario 4: Saturation Point Discovery")
	fmt.Println("------------------------------------------")
	fmt.Println("Finding maximum sustainable throughput")

	ratesPerSec := []int{50, 100, 200, 500, 1000}
	testDuration := 30 * time.Second

	for _, targetRate := range ratesPerSec {
		fmt.Printf("\n🔄 Testing target rate=%d ops/sec...\n", targetRate)

		cleanupAll(client, namespace)
		result := benchmarkSustainedRate(client, namespace, targetRate, testDuration)

		achievedRate := float64(result.Count) / testDuration.Seconds()
		efficiency := achievedRate / float64(targetRate) * 100

		fmt.Printf("   Target: %d ops/sec, Achieved: %.1f ops/sec (%.1f%% efficiency)\n",
			targetRate, achievedRate, efficiency)
		fmt.Printf("   P50=%v, P99=%v, errors=%d\n",
			result.LatencyP50.Round(time.Millisecond),
			result.LatencyP99.Round(time.Millisecond),
			result.Errors)

		if efficiency < 80 {
			fmt.Printf("   ⚠️  Saturation detected at ~%d ops/sec\n", int(achievedRate))
			break
		}
	}
}

func benchmarkSustainedRate(client dynamic.Interface, namespace string, targetRate int, duration time.Duration) OperationResult {
	ctx, cancel := context.WithTimeout(context.Background(), duration+10*time.Second)
	defer cancel()

	limiter := rate.NewLimiter(rate.Limit(targetRate), targetRate/5+1)
	hist := hdrhistogram.New(1, 60000000000, 3)
	var count, errors int64
	var idx int64

	start := time.Now()
	endTime := start.Add(duration)

	concurrency := targetRate / 10
	if concurrency < 10 {
		concurrency = 10
	}
	if concurrency > 200 {
		concurrency = 200
	}

	var wg sync.WaitGroup
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for time.Now().Before(endTime) {
				if err := limiter.Wait(ctx); err != nil {
					return
				}
				objIdx := atomic.AddInt64(&idx, 1)
				obj := makeProdQuery(namespace, int(objIdx))
				opStart := time.Now()
				_, err := client.Resource(queryGVR).Namespace(namespace).Create(ctx, obj, metav1.CreateOptions{})
				if err == nil {
					hist.RecordValue(time.Since(opStart).Nanoseconds())
					atomic.AddInt64(&count, 1)
				} else {
					atomic.AddInt64(&errors, 1)
				}
			}
		}()
	}
	wg.Wait()

	return OperationResult{
		Operation:   fmt.Sprintf("sustained-%d", targetRate),
		Count:       count,
		Errors:      errors,
		Throughput:  float64(count) / duration.Seconds(),
		LatencyP50:  time.Duration(hist.ValueAtQuantile(50)),
		LatencyP95:  time.Duration(hist.ValueAtQuantile(95)),
		LatencyP99:  time.Duration(hist.ValueAtQuantile(99)),
		LatencyMean: time.Duration(hist.Mean()),
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

func makeProdQuery(namespace string, idx int) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "ark.mckinsey.com/v1alpha1",
			"kind":       "Query",
			"metadata": map[string]interface{}{
				"name":      fmt.Sprintf("pq-%d-%d", testRunID%1000000, idx),
				"namespace": namespace,
				"labels": map[string]interface{}{
					"benchmark": "production",
					"scenario":  "mixed",
				},
			},
			"spec": map[string]interface{}{
				"target": map[string]interface{}{
					"name": benchAgentName,
					"type": "agent",
				},
				"input": map[string]interface{}{
					"type": "user",
					"text": fmt.Sprintf("Production benchmark query %d", idx),
				},
			},
		},
	}
}
