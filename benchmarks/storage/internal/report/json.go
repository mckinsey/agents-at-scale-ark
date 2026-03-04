package report

import (
	"encoding/json"
	"io"
	"time"

	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/bench"
	"github.com/mckinsey/agents-at-scale-ark/benchmarks/storage/internal/config"
)

type JSONReport struct {
	Timestamp time.Time      `json:"timestamp"`
	Config    *config.Config `json:"config"`
	Results   []bench.Result `json:"results"`
}

func WriteJSON(w io.Writer, results []bench.Result, cfg *config.Config) error {
	report := JSONReport{
		Timestamp: time.Now(),
		Config:    cfg,
		Results:   results,
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(report)
}
