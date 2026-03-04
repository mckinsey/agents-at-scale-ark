package bench

import (
	"context"
	"crypto/rand"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/config"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/generator"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/stats"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/store"
)

type Result struct {
	Store       string      `json:"store"`
	Benchmark   string      `json:"benchmark"`
	Concurrency int         `json:"concurrency"`
	Stats       stats.Stats `json:"stats"`
	Errors      int64       `json:"errors"`
	Timestamp   time.Time   `json:"timestamp"`
}

type WatchLatencyResult struct {
	Store     string             `json:"store"`
	Benchmark string             `json:"benchmark"`
	Stats     WatchLatencyStats  `json:"stats"`
	Timestamp time.Time          `json:"timestamp"`
}

type StoreBurstResult struct {
	Store     string       `json:"store"`
	Benchmark string       `json:"benchmark"`
	Stats     *BurstResult `json:"stats"`
	Timestamp time.Time    `json:"timestamp"`
}

type Runner struct {
	cfg     *config.Config
	stores  map[string]store.Store
	results []Result
	gen     *generator.Generators
}

func NewRunner(cfg *config.Config) *Runner {
	genCfg := generator.Config{
		KeyCount:          int64(cfg.Run.KeyCount),
		KeyDistribution:   cfg.Run.KeyDistribution,
		ZipfianTheta:      0.99,
		ValueDistribution: cfg.Run.ValueDistribution,
		ValueSize:         cfg.Run.ValueSize,
	}
	return &Runner{
		cfg:    cfg,
		stores: make(map[string]store.Store),
		gen:    generator.New(genCfg),
	}
}

func (r *Runner) Setup(ctx context.Context) error {
	for _, name := range r.cfg.Stores {
		var storeCfg any
		switch name {
		case "etcd":
			storeCfg = &store.EtcdConfig{
				Endpoints: r.cfg.Etcd.Endpoints,
				Prefix:    r.cfg.Etcd.Prefix,
			}
		case "postgres":
			storeCfg = &store.PostgresConfig{
				DSN:       r.cfg.Postgres.DSN,
				TableName: r.cfg.Postgres.TableName,
				PoolSize:  r.cfg.Postgres.PoolSize,
			}
		case "sqlite":
			storeCfg = &store.SQLiteConfig{
				Path:     r.cfg.SQLite.Path,
				WALMode:  r.cfg.SQLite.WALMode,
				SyncMode: r.cfg.SQLite.SyncMode,
			}
		default:
			continue
		}

		s, err := store.New(name, storeCfg)
		if err != nil {
			return fmt.Errorf("create store %s: %w", name, err)
		}
		if err := s.Setup(ctx); err != nil {
			return fmt.Errorf("setup store %s: %w", name, err)
		}
		r.stores[name] = s
	}
	return nil
}

func (r *Runner) Teardown(ctx context.Context) {
	for _, s := range r.stores {
		s.Teardown(ctx)
		s.Close()
	}
}

func (r *Runner) Run(ctx context.Context) ([]Result, error) {
	benchmarks := map[string]func(context.Context, store.Store, int) (*stats.Histogram, int64, error){
		"read":  r.benchRead,
		"write": r.benchWrite,
		"watch": r.benchWatch,
		"mixed": r.benchMixed,
	}

	for _, storeName := range r.cfg.Stores {
		s, ok := r.stores[storeName]
		if !ok {
			continue
		}

		for _, benchName := range r.cfg.Benchmarks {
			if benchName == "watch-latency" || benchName == "burst" {
				continue
			}

			benchFn, ok := benchmarks[benchName]
			if !ok {
				continue
			}

			for _, concurrency := range r.cfg.Run.Concurrency {
				if err := r.seedData(ctx, s); err != nil {
					return nil, fmt.Errorf("seed data: %w", err)
				}

				fmt.Printf("Warming up %s/%s (c=%d)...\n", storeName, benchName, concurrency)
				warmupCtx, warmupCancel := context.WithTimeout(ctx, r.cfg.Warmup.Duration)
				benchFn(warmupCtx, s, concurrency)
				warmupCancel()

				fmt.Printf("Running %s/%s (c=%d)...\n", storeName, benchName, concurrency)
				runCtx, runCancel := context.WithTimeout(ctx, r.cfg.Run.Duration)
				hist, errors, err := benchFn(runCtx, s, concurrency)
				runCancel()

				if err != nil {
					return nil, fmt.Errorf("benchmark %s/%s: %w", storeName, benchName, err)
				}

				r.results = append(r.results, Result{
					Store:       storeName,
					Benchmark:   benchName,
					Concurrency: concurrency,
					Stats:       hist.Stats(),
					Errors:      errors,
					Timestamp:   time.Now(),
				})

				s.Teardown(ctx)
				s.Setup(ctx)
			}
		}
	}

	return r.results, nil
}

func (r *Runner) RunWatchLatency(ctx context.Context) ([]WatchLatencyResult, error) {
	var results []WatchLatencyResult

	for _, storeName := range r.cfg.Stores {
		s, ok := r.stores[storeName]
		if !ok {
			continue
		}

		fmt.Printf("Running watch-latency for %s...\n", storeName)

		cfg := &WatchLatencyConfig{
			Writers:   r.cfg.WatchLatency.Writers,
			WriteRate: r.cfg.WatchLatency.WriteRate,
			Duration:  r.cfg.Run.Duration,
			ValueSize: r.cfg.Run.ValueSize,
		}

		bench := NewWatchLatencyBenchmark(cfg)
		_, _, err := bench.Run(ctx, s)
		if err != nil {
			return nil, fmt.Errorf("watch-latency %s: %w", storeName, err)
		}

		results = append(results, WatchLatencyResult{
			Store:     storeName,
			Benchmark: "watch-latency",
			Stats:     bench.Stats(),
			Timestamp: time.Now(),
		})

		s.Teardown(ctx)
		s.Setup(ctx)
	}

	return results, nil
}

func (r *Runner) RunBurst(ctx context.Context) ([]StoreBurstResult, error) {
	var results []StoreBurstResult

	for _, storeName := range r.cfg.Stores {
		s, ok := r.stores[storeName]
		if !ok {
			continue
		}

		fmt.Printf("Running burst for %s...\n", storeName)

		cfg := &BurstConfig{
			BaselineRPS:    r.cfg.Burst.BaselineRPS,
			BurstRPS:       r.cfg.Burst.BurstRPS,
			WarmupDuration: r.cfg.Burst.WarmupDuration,
			BurstDuration:  r.cfg.Burst.BurstDuration,
			RecoveryWindow: r.cfg.Burst.RecoveryWindow,
			ValueSize:      r.cfg.Run.ValueSize,
		}

		bench := NewBurstBenchmark(cfg)
		result, err := bench.Run(ctx, s)
		if err != nil {
			return nil, fmt.Errorf("burst %s: %w", storeName, err)
		}

		results = append(results, StoreBurstResult{
			Store:     storeName,
			Benchmark: "burst",
			Stats:     result,
			Timestamp: time.Now(),
		})

		s.Teardown(ctx)
		s.Setup(ctx)
	}

	return results, nil
}

func (r *Runner) seedData(ctx context.Context, s store.Store) error {
	batch := make([]store.KV, 0, 100)
	for i := 0; i < r.cfg.Run.KeyCount; i++ {
		key := fmt.Sprintf("key-%08d", i)
		value := r.gen.Value.Generate()
		batch = append(batch, store.KV{Key: key, Value: value})

		if len(batch) >= 100 {
			if err := s.BatchPut(ctx, batch); err != nil {
				return err
			}
			batch = batch[:0]
		}
	}
	if len(batch) > 0 {
		return s.BatchPut(ctx, batch)
	}
	return nil
}

func (r *Runner) randomKey() string {
	return r.gen.Key.Next()
}

func (r *Runner) randomValue() []byte {
	return r.gen.Value.Generate()
}

func randInt(max int) int {
	if max <= 0 {
		return 0
	}
	b := make([]byte, 4)
	rand.Read(b)
	return int(uint32(b[0])|uint32(b[1])<<8|uint32(b[2])<<16|uint32(b[3])<<24) % max
}

func (r *Runner) benchRead(ctx context.Context, s store.Store, concurrency int) (*stats.Histogram, int64, error) {
	hist := stats.New()
	var errors int64
	var wg sync.WaitGroup

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localHist := stats.New()

			for {
				select {
				case <-ctx.Done():
					hist.Merge(localHist)
					return
				default:
				}

				key := r.randomKey()
				start := time.Now()
				_, err := s.Get(ctx, key)
				elapsed := time.Since(start)

				if err != nil {
					atomic.AddInt64(&errors, 1)
					continue
				}
				localHist.Record(elapsed)
			}
		}()
	}

	wg.Wait()
	return hist, errors, nil
}

func (r *Runner) benchWrite(ctx context.Context, s store.Store, concurrency int) (*stats.Histogram, int64, error) {
	hist := stats.New()
	var errors int64
	var wg sync.WaitGroup
	var counter int64

	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localHist := stats.New()

			for {
				select {
				case <-ctx.Done():
					hist.Merge(localHist)
					return
				default:
				}

				n := atomic.AddInt64(&counter, 1)
				key := fmt.Sprintf("write-%d", n)
				value := r.randomValue()

				start := time.Now()
				err := s.Put(ctx, key, value)
				elapsed := time.Since(start)

				if err != nil {
					atomic.AddInt64(&errors, 1)
					continue
				}
				localHist.Record(elapsed)
			}
		}()
	}

	wg.Wait()
	return hist, errors, nil
}

func (r *Runner) benchWatch(ctx context.Context, s store.Store, concurrency int) (*stats.Histogram, int64, error) {
	hist := stats.New()
	var errors int64
	var wg sync.WaitGroup

	watchCtx, watchCancel := context.WithCancel(ctx)
	defer watchCancel()

	ch, err := s.Watch(watchCtx, "watch-")
	if err != nil {
		return nil, 0, err
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		for event := range ch {
			hist.Record(event.Latency)
		}
	}()

	var written int64
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				default:
				}

				n := atomic.AddInt64(&written, 1)
				key := fmt.Sprintf("watch-%d-%d", id, n)
				if err := s.Put(ctx, key, r.randomValue()); err != nil {
					atomic.AddInt64(&errors, 1)
				}
				time.Sleep(time.Millisecond)
			}
		}(i)
	}

	<-ctx.Done()
	watchCancel()
	wg.Wait()

	return hist, errors, nil
}

func (r *Runner) benchMixed(ctx context.Context, s store.Store, concurrency int) (*stats.Histogram, int64, error) {
	hist := stats.New()
	var errors int64
	var wg sync.WaitGroup

	readers := (concurrency * 80) / 100
	if readers < 1 {
		readers = 1
	}
	writers := concurrency - readers
	if writers < 1 && concurrency > 1 {
		writers = 1
		readers = concurrency - 1
	} else if writers < 1 {
		writers = 0
	}

	for i := 0; i < readers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localHist := stats.New()

			for {
				select {
				case <-ctx.Done():
					hist.Merge(localHist)
					return
				default:
				}

				start := time.Now()
				_, err := s.Get(ctx, r.randomKey())
				elapsed := time.Since(start)

				if err != nil {
					atomic.AddInt64(&errors, 1)
					continue
				}
				localHist.Record(elapsed)
			}
		}()
	}

	var counter int64
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			localHist := stats.New()

			for {
				select {
				case <-ctx.Done():
					hist.Merge(localHist)
					return
				default:
				}

				n := atomic.AddInt64(&counter, 1)
				key := fmt.Sprintf("mixed-%d", n)

				start := time.Now()
				err := s.Put(ctx, key, r.randomValue())
				elapsed := time.Since(start)

				if err != nil {
					atomic.AddInt64(&errors, 1)
					continue
				}
				localHist.Record(elapsed)
			}
		}()
	}

	wg.Wait()
	return hist, errors, nil
}
