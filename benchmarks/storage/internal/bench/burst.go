package bench

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/stats"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/store"
)

type BurstBenchmark struct {
	cfg *BurstConfig
}

type BurstConfig struct {
	BaselineRPS    int
	BurstRPS       int
	WarmupDuration time.Duration
	BurstDuration  time.Duration
	RecoveryWindow time.Duration
	KeyPrefix      string
	ValueSize      int
}

type BurstResult struct {
	BaselineLatency  stats.Stats   `json:"baseline_latency"`
	BurstLatency     stats.Stats   `json:"burst_latency"`
	RecoveryLatency  stats.Stats   `json:"recovery_latency"`
	RecoveryTime     time.Duration `json:"recovery_time"`
	TotalRequests    int64         `json:"total_requests"`
	SuccessRequests  int64         `json:"success_requests"`
	FailedRequests   int64         `json:"failed_requests"`
	MaxQueueDepth    int64         `json:"max_queue_depth"`
	BurstMultiplier  float64       `json:"burst_multiplier"`
}

func NewBurstBenchmark(cfg *BurstConfig) *BurstBenchmark {
	if cfg.KeyPrefix == "" {
		cfg.KeyPrefix = "burst-"
	}
	if cfg.ValueSize == 0 {
		cfg.ValueSize = 256
	}
	return &BurstBenchmark{cfg: cfg}
}

func (b *BurstBenchmark) Run(ctx context.Context, s store.Store) (*BurstResult, error) {
	baselineHist := stats.New()
	burstHist := stats.New()
	recoveryHist := stats.New()

	var totalReqs, successReqs, failedReqs atomic.Int64
	var maxQueueDepth, currentDepth atomic.Int64

	doOp := func(hist *stats.Histogram, seq int64) {
		totalReqs.Add(1)
		depth := currentDepth.Add(1)
		for {
			max := maxQueueDepth.Load()
			if depth <= max || maxQueueDepth.CompareAndSwap(max, depth) {
				break
			}
		}
		defer currentDepth.Add(-1)

		key := b.cfg.KeyPrefix + formatSeq(uint64(seq))
		value := make([]byte, b.cfg.ValueSize)

		start := time.Now()
		err := s.Put(ctx, key, value)
		elapsed := time.Since(start)

		if err != nil {
			failedReqs.Add(1)
		} else {
			successReqs.Add(1)
			hist.Record(elapsed)
		}
	}

	runPhase := func(hist *stats.Histogram, duration time.Duration, rps int, startSeq *atomic.Int64) {
		if rps == 0 {
			return
		}
		interval := time.Second / time.Duration(rps)
		deadline := time.Now().Add(duration)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		var wg sync.WaitGroup
		for time.Now().Before(deadline) {
			select {
			case <-ctx.Done():
				wg.Wait()
				return
			case <-ticker.C:
				seq := startSeq.Add(1)
				wg.Add(1)
				go func(s int64) {
					defer wg.Done()
					doOp(hist, s)
				}(seq)
			}
		}
		wg.Wait()
	}

	var seq atomic.Int64

	runPhase(baselineHist, b.cfg.WarmupDuration, b.cfg.BaselineRPS, &seq)
	baselineP99 := baselineHist.Stats().P99

	runPhase(burstHist, b.cfg.BurstDuration, b.cfg.BurstRPS, &seq)

	recoveryStart := time.Now()
	var recoveryTime time.Duration
	recoveryCtx, cancel := context.WithTimeout(ctx, b.cfg.RecoveryWindow)
	defer cancel()

	checkInterval := 500 * time.Millisecond
	sampleWindow := 200 * time.Millisecond
	ticker := time.NewTicker(checkInterval)
	defer ticker.Stop()

	recovered := false
	for !recovered {
		select {
		case <-recoveryCtx.Done():
			recoveryTime = b.cfg.RecoveryWindow
			recovered = true
		case <-ticker.C:
			sampleHist := stats.New()
			runPhase(sampleHist, sampleWindow, b.cfg.BaselineRPS, &seq)
			currentP99 := sampleHist.Stats().P99

			recoveryHist.Merge(sampleHist)

			if currentP99 <= baselineP99*120/100 {
				recoveryTime = time.Since(recoveryStart)
				recovered = true
			}
		}
	}

	return &BurstResult{
		BaselineLatency:  baselineHist.Stats(),
		BurstLatency:     burstHist.Stats(),
		RecoveryLatency:  recoveryHist.Stats(),
		RecoveryTime:     recoveryTime,
		TotalRequests:    totalReqs.Load(),
		SuccessRequests:  successReqs.Load(),
		FailedRequests:   failedReqs.Load(),
		MaxQueueDepth:    maxQueueDepth.Load(),
		BurstMultiplier:  float64(b.cfg.BurstRPS) / float64(b.cfg.BaselineRPS),
	}, nil
}
