package bench

import (
	"context"
	"encoding/binary"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/stats"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/store"
)

type WatchLatencyBenchmark struct {
	cfg       *WatchLatencyConfig
	histogram *stats.Histogram
	errors    int64
	received  int64
	written   int64
	missed    int64
}

type WatchLatencyConfig struct {
	Writers     int
	WriteRate   int
	Duration    time.Duration
	KeyPrefix   string
	ValueSize   int
}

func NewWatchLatencyBenchmark(cfg *WatchLatencyConfig) *WatchLatencyBenchmark {
	if cfg.KeyPrefix == "" {
		cfg.KeyPrefix = "watch-lat-"
	}
	if cfg.ValueSize < 24 {
		cfg.ValueSize = 24
	}
	return &WatchLatencyBenchmark{
		cfg:       cfg,
		histogram: stats.New(),
	}
}

func (w *WatchLatencyBenchmark) Run(ctx context.Context, s store.Store) (*stats.Histogram, int64, error) {
	ctx, cancel := context.WithTimeout(ctx, w.cfg.Duration)
	defer cancel()

	ch, err := s.Watch(ctx, w.cfg.KeyPrefix)
	if err != nil {
		return nil, 0, err
	}

	var wg sync.WaitGroup
	received := make(map[uint64]struct{})
	var receivedMu sync.Mutex

	wg.Add(1)
	go func() {
		defer wg.Done()
		for event := range ch {
			receiveTime := time.Now().UnixNano()
			atomic.AddInt64(&w.received, 1)

			if len(event.KV.Value) >= 16 {
				sendTime := int64(binary.BigEndian.Uint64(event.KV.Value[0:8]))
				seq := binary.BigEndian.Uint64(event.KV.Value[8:16])

				latency := receiveTime - sendTime
				if latency > 0 && latency < int64(30*time.Second) {
					w.histogram.Record(time.Duration(latency))
				}

				receivedMu.Lock()
				received[seq] = struct{}{}
				receivedMu.Unlock()
			}
		}
	}()

	var seq atomic.Uint64
	interval := time.Second / time.Duration(w.cfg.WriteRate/w.cfg.Writers)

	for i := 0; i < w.cfg.Writers; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			ticker := time.NewTicker(interval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					n := seq.Add(1)
					key := w.cfg.KeyPrefix + string(rune('a'+id)) + "-" + formatSeq(n)
					value := makeTimestampedValue(n, w.cfg.ValueSize)

					atomic.AddInt64(&w.written, 1)
					if err := s.Put(ctx, key, value); err != nil {
						atomic.AddInt64(&w.errors, 1)
					}
				}
			}
		}(i)
	}

	<-ctx.Done()
	time.Sleep(100 * time.Millisecond)
	wg.Wait()

	receivedMu.Lock()
	total := seq.Load()
	for i := uint64(1); i <= total; i++ {
		if _, ok := received[i]; !ok {
			w.missed++
		}
	}
	receivedMu.Unlock()

	return w.histogram, w.errors, nil
}

func (w *WatchLatencyBenchmark) Stats() WatchLatencyStats {
	return WatchLatencyStats{
		Latency:      w.histogram.Stats(),
		Written:      w.written,
		Received:     w.received,
		Missed:       w.missed,
		Errors:       w.errors,
		DeliveryRate: float64(w.received) / float64(w.written),
	}
}

type WatchLatencyStats struct {
	Latency      stats.Stats `json:"latency"`
	Written      int64       `json:"written"`
	Received     int64       `json:"received"`
	Missed       int64       `json:"missed"`
	Errors       int64       `json:"errors"`
	DeliveryRate float64     `json:"delivery_rate"`
}

func makeTimestampedValue(seq uint64, size int) []byte {
	value := make([]byte, size)
	binary.BigEndian.PutUint64(value[0:8], uint64(time.Now().UnixNano()))
	binary.BigEndian.PutUint64(value[8:16], seq)
	return value
}

func formatSeq(n uint64) string {
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, n)
	return string(buf)
}
