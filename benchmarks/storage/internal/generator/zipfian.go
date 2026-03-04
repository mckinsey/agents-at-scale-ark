package generator

import (
	"math"
	"math/rand"
	"sync"
)

// Zipfian generates keys following a Zipfian distribution where some items
// are accessed much more frequently than others.
type Zipfian struct {
	mu        sync.Mutex
	rng       *rand.Rand
	items     int64
	theta     float64
	alpha     float64
	zetan     float64
	zeta2     float64
	eta       float64
	halfPow   float64
}

func NewZipfian(items int64, theta float64, src rand.Source) *Zipfian {
	z := &Zipfian{
		rng:   rand.New(src),
		items: items,
		theta: theta,
	}
	z.alpha = 1.0 / (1.0 - theta)
	z.zetan = zeta(items, theta)
	z.zeta2 = zeta(2, theta)
	z.eta = (1 - math.Pow(2.0/float64(items), 1-theta)) / (1 - z.zeta2/z.zetan)
	z.halfPow = math.Pow(0.5, theta)
	return z
}

func (z *Zipfian) Next() int64 {
	z.mu.Lock()
	u := z.rng.Float64()
	z.mu.Unlock()

	uz := u * z.zetan
	if uz < 1.0 {
		return 0
	}
	if uz < 1.0+z.halfPow {
		return 1
	}
	return int64(float64(z.items) * math.Pow(z.eta*u-z.eta+1, z.alpha))
}

func zeta(n int64, theta float64) float64 {
	var sum float64
	for i := int64(0); i < n; i++ {
		sum += 1.0 / math.Pow(float64(i+1), theta)
	}
	return sum
}

// ScrambledZipfian wraps Zipfian to scatter hot items across the keyspace
// rather than clustering them at low indices.
type ScrambledZipfian struct {
	zipf      *Zipfian
	itemCount int64
	scramble  int64
}

func NewScrambledZipfian(items int64, theta float64, src rand.Source) *ScrambledZipfian {
	return &ScrambledZipfian{
		zipf:      NewZipfian(items, theta, src),
		itemCount: items,
		scramble:  rand.New(src).Int63(),
	}
}

func (s *ScrambledZipfian) Next() int64 {
	n := s.zipf.Next()
	return fnvHash(n+s.scramble) % s.itemCount
}

func fnvHash(val int64) int64 {
	const (
		offset = 14695981039346656037
		prime  = 1099511628211
	)
	hash := uint64(offset)
	for i := 0; i < 8; i++ {
		hash ^= uint64((val >> (i * 8)) & 0xff)
		hash *= prime
	}
	return int64(hash & 0x7fffffffffffffff)
}

// Uniform generates keys with uniform random distribution.
type Uniform struct {
	mu    sync.Mutex
	rng   *rand.Rand
	items int64
}

func NewUniform(items int64, src rand.Source) *Uniform {
	return &Uniform{
		rng:   rand.New(src),
		items: items,
	}
}

func (u *Uniform) Next() int64 {
	u.mu.Lock()
	n := u.rng.Int63n(u.items)
	u.mu.Unlock()
	return n
}

// Latest generates keys biased toward recently inserted items.
type Latest struct {
	mu      sync.Mutex
	rng     *rand.Rand
	base    int64
	current int64
	zipf    *Zipfian
}

func NewLatest(base int64, src rand.Source) *Latest {
	return &Latest{
		rng:     rand.New(src),
		base:    base,
		current: base,
		zipf:    NewZipfian(base, 0.99, src),
	}
}

func (l *Latest) Next() int64 {
	l.mu.Lock()
	offset := l.zipf.Next()
	if offset > l.current {
		offset = l.current
	}
	result := l.current - offset
	l.mu.Unlock()
	return result
}

func (l *Latest) Acknowledge() {
	l.mu.Lock()
	l.current++
	l.mu.Unlock()
}
