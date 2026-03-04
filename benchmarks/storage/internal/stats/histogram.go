package stats

import (
	"sync"
	"time"

	"github.com/HdrHistogram/hdrhistogram-go"
)

type Histogram struct {
	h         *hdrhistogram.Histogram
	startTime time.Time
	count     int64
	mu        sync.Mutex
}

func New() *Histogram {
	return &Histogram{
		h:         hdrhistogram.New(1, 60000000, 3),
		startTime: time.Now(),
	}
}

func (h *Histogram) Record(d time.Duration) {
	h.mu.Lock()
	h.h.RecordValue(d.Microseconds())
	h.count++
	h.mu.Unlock()
}

func (h *Histogram) Merge(other *Histogram) {
	h.mu.Lock()
	other.mu.Lock()
	h.h.Merge(other.h)
	h.count += other.count
	other.mu.Unlock()
	h.mu.Unlock()
}

type Stats struct {
	Count      int64         `json:"count"`
	TotalTime  time.Duration `json:"total_time"`
	Throughput float64       `json:"throughput_ops_sec"`
	Mean       time.Duration `json:"mean"`
	StdDev     time.Duration `json:"std_dev"`
	Min        time.Duration `json:"min"`
	Max        time.Duration `json:"max"`
	P50        time.Duration `json:"p50"`
	P75        time.Duration `json:"p75"`
	P90        time.Duration `json:"p90"`
	P95        time.Duration `json:"p95"`
	P99        time.Duration `json:"p99"`
	P999       time.Duration `json:"p999"`
}

func (h *Histogram) Stats() Stats {
	h.mu.Lock()
	defer h.mu.Unlock()

	elapsed := time.Since(h.startTime)
	throughput := float64(0)
	if elapsed > 0 {
		throughput = float64(h.count) / elapsed.Seconds()
	}

	return Stats{
		Count:      h.count,
		TotalTime:  elapsed,
		Throughput: throughput,
		Mean:       time.Duration(h.h.Mean()) * time.Microsecond,
		StdDev:     time.Duration(h.h.StdDev()) * time.Microsecond,
		Min:        time.Duration(h.h.Min()) * time.Microsecond,
		Max:        time.Duration(h.h.Max()) * time.Microsecond,
		P50:        time.Duration(h.h.ValueAtQuantile(50)) * time.Microsecond,
		P75:        time.Duration(h.h.ValueAtQuantile(75)) * time.Microsecond,
		P90:        time.Duration(h.h.ValueAtQuantile(90)) * time.Microsecond,
		P95:        time.Duration(h.h.ValueAtQuantile(95)) * time.Microsecond,
		P99:        time.Duration(h.h.ValueAtQuantile(99)) * time.Microsecond,
		P999:       time.Duration(h.h.ValueAtQuantile(99.9)) * time.Microsecond,
	}
}

func (h *Histogram) Reset() {
	h.mu.Lock()
	h.h.Reset()
	h.startTime = time.Now()
	h.count = 0
	h.mu.Unlock()
}
