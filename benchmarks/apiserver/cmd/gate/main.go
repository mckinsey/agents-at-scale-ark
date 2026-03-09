package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"sigs.k8s.io/yaml"
)

type BenchmarkResult struct {
	Operation   string  `json:"operation"`
	Count       int64   `json:"count"`
	Throughput  float64 `json:"throughput_per_sec"`
	LatencyP99  int64   `json:"latency_p99_ns"`
	Errors      int64   `json:"errors"`
}

type BenchmarkSuite struct {
	Results []BenchmarkResult `json:"results"`
}

type Threshold struct {
	MaxErrorRate  float64 `json:"max_error_rate"`
	MaxP99Ms      float64 `json:"max_p99_ms"`
	MinThroughput float64 `json:"min_throughput"`
}

type ThresholdConfig struct {
	Operations map[string]Threshold `json:"operations"`
}

func main() {
	var resultsPath string
	var thresholdsPath string

	flag.StringVar(&resultsPath, "results", "", "Path to benchmark results JSON")
	flag.StringVar(&thresholdsPath, "thresholds", "thresholds.yaml", "Path to thresholds YAML")
	flag.Parse()

	if resultsPath == "" {
		fmt.Fprintln(os.Stderr, "missing -results flag")
		os.Exit(2)
	}

	thresholds, err := loadThresholds(thresholdsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load thresholds: %v\n", err)
		os.Exit(2)
	}

	suite, err := loadResults(resultsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load results: %v\n", err)
		os.Exit(2)
	}

	failures := check(suite, thresholds)

	for _, f := range failures {
		fmt.Printf("FAIL: %s\n", f)
	}

	if len(failures) > 0 {
		fmt.Printf("\n%d gate(s) failed\n", len(failures))
		os.Exit(1)
	}

	fmt.Println("All gates passed")
}

func loadThresholds(path string) (*ThresholdConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cfg ThresholdConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func loadResults(path string) (*BenchmarkSuite, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var suite BenchmarkSuite
	if err := json.Unmarshal(data, &suite); err != nil {
		return nil, err
	}
	return &suite, nil
}

func check(suite *BenchmarkSuite, cfg *ThresholdConfig) []string {
	var failures []string

	for _, r := range suite.Results {
		t, ok := cfg.Operations[r.Operation]
		if !ok {
			continue
		}

		total := r.Count + r.Errors
		if total == 0 {
			failures = append(failures, fmt.Sprintf("[%s] no results recorded", r.Operation))
			continue
		}

		errorRate := float64(r.Errors) / float64(total)
		if errorRate > t.MaxErrorRate {
			failures = append(failures, fmt.Sprintf("[%s] error rate %.2f%% exceeds max %.2f%%",
				r.Operation, errorRate*100, t.MaxErrorRate*100))
		}

		p99Ms := float64(r.LatencyP99) / 1e6
		if t.MaxP99Ms > 0 && p99Ms > t.MaxP99Ms {
			failures = append(failures, fmt.Sprintf("[%s] p99 latency %.1fms exceeds max %.1fms",
				r.Operation, p99Ms, t.MaxP99Ms))
		}

		if t.MinThroughput > 0 && r.Throughput < t.MinThroughput {
			failures = append(failures, fmt.Sprintf("[%s] throughput %.1f ops/s below min %.1f ops/s",
				r.Operation, r.Throughput, t.MinThroughput))
		}
	}

	return failures
}
