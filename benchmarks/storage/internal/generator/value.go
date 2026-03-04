package generator

import (
	"math"
	"math/rand"
	"sync"
)

// ValueSize generates realistic value sizes following statistical distributions.
type ValueSize struct {
	mu           sync.Mutex
	rng          *rand.Rand
	distribution string
	minSize      int
	maxSize      int
	// Log-normal parameters
	logMu    float64
	logSigma float64
	// Pareto parameters
	paretoAlpha float64
	paretoXm    float64
}

type ValueSizeConfig struct {
	Distribution string // "uniform", "lognormal", "pareto"
	MinSize      int
	MaxSize      int
	// Log-normal: median ~exp(mu), spread controlled by sigma
	LogNormalMu    float64
	LogNormalSigma float64
	// Pareto: Xm is minimum, Alpha controls tail heaviness
	ParetoAlpha float64
	ParetoXm    float64
}

func NewValueSize(cfg ValueSizeConfig, src rand.Source) *ValueSize {
	return &ValueSize{
		rng:          rand.New(src),
		distribution: cfg.Distribution,
		minSize:      cfg.MinSize,
		maxSize:      cfg.MaxSize,
		logMu:        cfg.LogNormalMu,
		logSigma:     cfg.LogNormalSigma,
		paretoAlpha:  cfg.ParetoAlpha,
		paretoXm:     cfg.ParetoXm,
	}
}

func (v *ValueSize) Next() int {
	if v.distribution == "fixed" {
		return v.minSize
	}

	v.mu.Lock()
	var size float64
	switch v.distribution {
	case "lognormal":
		u1 := v.rng.Float64()
		u2 := v.rng.Float64()
		normal := math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
		size = math.Exp(v.logMu + v.logSigma*normal)
	case "pareto":
		u := v.rng.Float64()
		size = v.paretoXm / math.Pow(u, 1.0/v.paretoAlpha)
	default:
		size = float64(v.minSize) + v.rng.Float64()*float64(v.maxSize-v.minSize)
	}
	v.mu.Unlock()

	s := int(size)
	if s < v.minSize {
		return v.minSize
	}
	if s > v.maxSize {
		return v.maxSize
	}
	return s
}

// RealisticValueSize returns a generator based on production workload analysis.
// Produces values with median ~256 bytes, long tail to 100KB.
func RealisticValueSize(src rand.Source) *ValueSize {
	return NewValueSize(ValueSizeConfig{
		Distribution:   "lognormal",
		MinSize:        16,
		MaxSize:        102400, // 100KB max
		LogNormalMu:    5.5,    // median ~245 bytes
		LogNormalSigma: 1.2,    // moderate spread
	}, src)
}

// FixedValueSize returns a generator that always produces the same size.
func FixedValueSize(size int) *ValueSize {
	return &ValueSize{
		distribution: "fixed",
		minSize:      size,
		maxSize:      size,
	}
}

func (v *ValueSize) Generate() []byte {
	size := v.Next()
	data := make([]byte, size)
	if v.rng != nil {
		v.mu.Lock()
		v.rng.Read(data)
		v.mu.Unlock()
	}
	return data
}
