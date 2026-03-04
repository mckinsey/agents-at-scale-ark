package config

import (
	"encoding/json"
	"os"
	"time"
)

type Config struct {
	Stores       []string           `json:"stores"`
	Benchmarks   []string           `json:"benchmarks"`
	Warmup       WarmupConfig       `json:"warmup"`
	Run          RunConfig          `json:"run"`
	WatchLatency WatchLatencyConfig `json:"watch_latency"`
	Burst        BurstConfig        `json:"burst"`
	Etcd         EtcdConfig         `json:"etcd"`
	Postgres     PostgresConfig     `json:"postgres"`
	SQLite       SQLiteConfig       `json:"sqlite"`
	Output       OutputConfig       `json:"output"`
}

type WarmupConfig struct {
	Duration   time.Duration `json:"duration"`
	Operations int           `json:"operations"`
}

type RunConfig struct {
	Duration         time.Duration `json:"duration"`
	Concurrency      []int         `json:"concurrency"`
	KeySize          int           `json:"key_size"`
	ValueSize        int           `json:"value_size"`
	KeyCount         int           `json:"key_count"`
	KeyDistribution  string        `json:"key_distribution"`
	ValueDistribution string       `json:"value_distribution"`
}

type WatchLatencyConfig struct {
	Writers   int `json:"writers"`
	WriteRate int `json:"write_rate"`
}

type BurstConfig struct {
	BaselineRPS    int           `json:"baseline_rps"`
	BurstRPS       int           `json:"burst_rps"`
	WarmupDuration time.Duration `json:"warmup_duration"`
	BurstDuration  time.Duration `json:"burst_duration"`
	RecoveryWindow time.Duration `json:"recovery_window"`
}

type EtcdConfig struct {
	Endpoints []string `json:"endpoints"`
	Prefix    string   `json:"prefix"`
}

type PostgresConfig struct {
	DSN       string `json:"dsn"`
	TableName string `json:"table_name"`
	PoolSize  int    `json:"pool_size"`
}

type SQLiteConfig struct {
	Path     string `json:"path"`
	WALMode  bool   `json:"wal_mode"`
	SyncMode string `json:"sync_mode"`
}

type OutputConfig struct {
	Format string `json:"format"`
	File   string `json:"file"`
}

func Load(path string) (*Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var cfg Config
	if err := json.NewDecoder(f).Decode(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func Default() *Config {
	return &Config{
		Stores:     []string{"etcd", "postgres", "sqlite"},
		Benchmarks: []string{"read", "write", "watch", "mixed"},
		Warmup: WarmupConfig{
			Duration:   5 * time.Second,
			Operations: 1000,
		},
		Run: RunConfig{
			Duration:          30 * time.Second,
			Concurrency:       []int{1, 4, 16, 64},
			KeySize:           32,
			ValueSize:         256,
			KeyCount:          10000,
			KeyDistribution:   "zipfian",
			ValueDistribution: "fixed",
		},
		WatchLatency: WatchLatencyConfig{
			Writers:   4,
			WriteRate: 100,
		},
		Burst: BurstConfig{
			BaselineRPS:    100,
			BurstRPS:       1000,
			WarmupDuration: 5 * time.Second,
			BurstDuration:  10 * time.Second,
			RecoveryWindow: 30 * time.Second,
		},
		Etcd: EtcdConfig{
			Endpoints: []string{"localhost:2379"},
			Prefix:    "/bench/",
		},
		Postgres: PostgresConfig{
			DSN:       "postgres://localhost:5432/bench?sslmode=disable",
			TableName: "bench_kv",
			PoolSize:  64,
		},
		SQLite: SQLiteConfig{
			Path:     "/tmp/bench.db",
			WALMode:  true,
			SyncMode: "NORMAL",
		},
		Output: OutputConfig{
			Format: "both",
			File:   "results.json",
		},
	}
}
