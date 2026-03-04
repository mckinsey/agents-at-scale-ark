package generator

import (
	"fmt"
	"math/rand"
)

// KeyGenerator is the interface for all key generation strategies.
type KeyGenerator interface {
	Next() int64
}

// Key wraps a KeyGenerator and formats keys as strings.
type Key struct {
	gen    KeyGenerator
	format string
}

func NewKey(gen KeyGenerator, format string) *Key {
	if format == "" {
		format = "key:%016x"
	}
	return &Key{gen: gen, format: format}
}

func (k *Key) Next() string {
	return fmt.Sprintf(k.format, k.gen.Next())
}

func (k *Key) NextN(n int) []string {
	keys := make([]string, n)
	for i := range keys {
		keys[i] = k.Next()
	}
	return keys
}

// Config holds parameters for creating key and value generators.
type Config struct {
	KeyCount         int64
	KeyDistribution  string  // "zipfian", "uniform", "latest"
	ZipfianTheta     float64 // 0.99 typical for realistic workloads
	ValueDistribution string  // "fixed", "lognormal", "pareto", "uniform"
	ValueSize         int     // for fixed distribution
	ValueMin          int
	ValueMax          int
	Seed              int64
}

func DefaultConfig() Config {
	return Config{
		KeyCount:          10000,
		KeyDistribution:   "zipfian",
		ZipfianTheta:      0.99,
		ValueDistribution: "lognormal",
		ValueSize:         256,
		ValueMin:          16,
		ValueMax:          102400,
		Seed:              0,
	}
}

type Generators struct {
	Key   *Key
	Value *ValueSize
}

func New(cfg Config) *Generators {
	if cfg.Seed == 0 {
		cfg.Seed = rand.Int63()
	}
	src := rand.NewSource(cfg.Seed)

	var keyGen KeyGenerator
	switch cfg.KeyDistribution {
	case "zipfian":
		keyGen = NewScrambledZipfian(cfg.KeyCount, cfg.ZipfianTheta, src)
	case "latest":
		keyGen = NewLatest(cfg.KeyCount, src)
	default:
		keyGen = NewUniform(cfg.KeyCount, src)
	}

	var valueGen *ValueSize
	switch cfg.ValueDistribution {
	case "lognormal":
		valueGen = RealisticValueSize(src)
	case "fixed":
		valueGen = FixedValueSize(cfg.ValueSize)
	default:
		valueGen = NewValueSize(ValueSizeConfig{
			Distribution: "uniform",
			MinSize:      cfg.ValueMin,
			MaxSize:      cfg.ValueMax,
		}, src)
	}

	return &Generators{
		Key:   NewKey(keyGen, ""),
		Value: valueGen,
	}
}
