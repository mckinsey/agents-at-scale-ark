package report

import (
	"fmt"
	"io"
	"sort"
	"text/tabwriter"
	"time"

	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/bench"
)

func WriteTable(w io.Writer, results []bench.Result) {
	byBenchmark := make(map[string][]bench.Result)
	for _, r := range results {
		key := fmt.Sprintf("%s (c=%d)", r.Benchmark, r.Concurrency)
		byBenchmark[key] = append(byBenchmark[key], r)
	}

	var keys []string
	for k := range byBenchmark {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)

	for _, key := range keys {
		fmt.Fprintf(tw, "\n=== %s ===\n", key)
		fmt.Fprintf(tw, "Store\tOps/sec\tMean\tP50\tP95\tP99\tErrors\n")
		fmt.Fprintf(tw, "-----\t-------\t----\t---\t---\t---\t------\n")

		for _, r := range byBenchmark[key] {
			fmt.Fprintf(tw, "%s\t%.0f\t%s\t%s\t%s\t%s\t%d\n",
				r.Store,
				r.Stats.Throughput,
				formatDuration(r.Stats.Mean),
				formatDuration(r.Stats.P50),
				formatDuration(r.Stats.P95),
				formatDuration(r.Stats.P99),
				r.Errors,
			)
		}
	}
	tw.Flush()

	fmt.Fprintf(w, "\n=== Comparison Summary ===\n")
	writeComparison(w, results)
}

func writeComparison(w io.Writer, results []bench.Result) {
	type key struct {
		benchmark   string
		concurrency int
	}
	best := make(map[key]bench.Result)
	for _, r := range results {
		k := key{r.Benchmark, r.Concurrency}
		if existing, ok := best[k]; !ok || r.Stats.Throughput > existing.Stats.Throughput {
			best[k] = r
		}
	}

	tw := tabwriter.NewWriter(w, 0, 0, 2, ' ', 0)
	fmt.Fprintf(tw, "Benchmark\tConcurrency\tWinner\tOps/sec\n")
	fmt.Fprintf(tw, "---------\t-----------\t------\t-------\n")

	var sortedKeys []key
	for k := range best {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Slice(sortedKeys, func(i, j int) bool {
		if sortedKeys[i].benchmark != sortedKeys[j].benchmark {
			return sortedKeys[i].benchmark < sortedKeys[j].benchmark
		}
		return sortedKeys[i].concurrency < sortedKeys[j].concurrency
	})

	for _, k := range sortedKeys {
		r := best[k]
		fmt.Fprintf(tw, "%s\t%d\t%s\t%.0f\n", k.benchmark, k.concurrency, r.Store, r.Stats.Throughput)
	}
	tw.Flush()
}

func formatDuration(d time.Duration) string {
	if d < time.Microsecond {
		return fmt.Sprintf("%dns", d.Nanoseconds())
	}
	if d < time.Millisecond {
		return fmt.Sprintf("%.1fµs", float64(d.Nanoseconds())/1000)
	}
	if d < time.Second {
		return fmt.Sprintf("%.2fms", float64(d.Nanoseconds())/1000000)
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}
