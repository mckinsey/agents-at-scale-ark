package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"

	"sigs.k8s.io/yaml"
)

type BenchmarkResult struct {
	Operation  string  `json:"operation"`
	Count      int64   `json:"count"`
	Throughput float64 `json:"throughput_per_sec"`
	LatencyP99 int64   `json:"latency_p99_ns"`
	Errors     int64   `json:"errors"`
}

type BenchmarkConfig struct {
	Concurrency int `json:"concurrency"`
}

type BenchmarkSuite struct {
	Results []BenchmarkResult `json:"results"`
	Config  BenchmarkConfig   `json:"config"`
}

type ScalingSuite struct {
	Levels []BenchmarkSuite `json:"levels"`
}

type Threshold struct {
	MaxErrorRate  float64 `json:"max_error_rate"`
	MaxP99Ms      float64 `json:"max_p99_ms"`
	MinThroughput float64 `json:"min_throughput"`
}

type Targets struct {
	ScalingRatioMin   float64              `json:"scaling_ratio_min"`
	ConcurrencyLevels []int                `json:"concurrency_levels"`
	Operations        map[string]Threshold `json:"operations"`
}

func main() {
	var resultsPath string
	var targetsPath string

	flag.StringVar(&resultsPath, "results", "", "Path to benchmark results JSON")
	flag.StringVar(&targetsPath, "targets", "targets.default.yaml", "Path to targets YAML")
	flag.Parse()

	if resultsPath == "" {
		fmt.Fprintln(os.Stderr, "missing -results flag")
		os.Exit(2)
	}

	targets, err := loadTargets(targetsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to load targets: %v\n", err)
		os.Exit(2)
	}

	data, err := os.ReadFile(resultsPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read results: %v\n", err)
		os.Exit(2)
	}

	var failures []string

	var scaling ScalingSuite
	if err := json.Unmarshal(data, &scaling); err == nil && len(scaling.Levels) > 0 {
		for _, level := range scaling.Levels {
			failures = append(failures, checkThresholds(level.Results, targets.Operations)...)
		}
		if targets.ScalingRatioMin > 0 {
			failures = append(failures, checkScalingRatios(&scaling, targets.ScalingRatioMin)...)
		}
	} else {
		var suite BenchmarkSuite
		if err := json.Unmarshal(data, &suite); err != nil {
			fmt.Fprintf(os.Stderr, "failed to parse results: %v\n", err)
			os.Exit(2)
		}
		failures = checkThresholds(suite.Results, targets.Operations)
	}

	for _, f := range failures {
		fmt.Printf("FAIL: %s\n", f)
	}

	if len(failures) > 0 {
		fmt.Printf("\n%d gate(s) failed\n", len(failures))
		os.Exit(1)
	}

	fmt.Println("All gates passed")
}

func loadTargets(path string) (*Targets, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var t Targets
	if err := yaml.Unmarshal(data, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

func checkThresholds(results []BenchmarkResult, ops map[string]Threshold) []string {
	var failures []string

	for _, r := range results {
		t, ok := ops[r.Operation]
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

func checkScalingRatios(scaling *ScalingSuite, minRatio float64) []string {
	var failures []string

	if len(scaling.Levels) < 2 {
		failures = append(failures, "[scaling] need at least 2 concurrency levels to compute scaling ratios")
		return failures
	}

	baseLevel := scaling.Levels[0]
	baseConcurrency := baseLevel.Config.Concurrency
	baseThroughput := throughputByOp(baseLevel.Results)

	fmt.Printf("\nScaling ratio analysis (baseline concurrency=%d, min_ratio=%.2f):\n", baseConcurrency, minRatio)

	for i := 1; i < len(scaling.Levels); i++ {
		level := scaling.Levels[i]
		levelConcurrency := level.Config.Concurrency
		concurrencyMultiplier := float64(levelConcurrency) / float64(baseConcurrency)
		levelThroughput := throughputByOp(level.Results)

		for op, baseTP := range baseThroughput {
			levelTP, ok := levelThroughput[op]
			if !ok || baseTP == 0 {
				continue
			}

			throughputMultiplier := levelTP / baseTP
			ratio := throughputMultiplier / concurrencyMultiplier

			status := "PASS"
			if ratio < minRatio {
				status = "FAIL"
				failures = append(failures, fmt.Sprintf("[scaling][%s] ratio %.3f at %dx concurrency below min %.2f",
					op, ratio, levelConcurrency, minRatio))
			}

			fmt.Printf("  %s: %s concurrency %d->%d  throughput %.1f->%.1f  ratio=%.3f\n",
				status, op, baseConcurrency, levelConcurrency, baseTP, levelTP, ratio)
		}
	}

	return failures
}

func throughputByOp(results []BenchmarkResult) map[string]float64 {
	m := make(map[string]float64)
	for _, r := range results {
		m[r.Operation] = r.Throughput
	}
	return m
}
