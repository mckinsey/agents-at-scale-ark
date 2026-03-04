package store

import (
	"context"
	"fmt"
	"io"
	"time"
)

type KV struct {
	Key       string
	Value     []byte
	Version   int64
	CreatedAt int64
	UpdatedAt int64
}

type WatchEvent struct {
	Type    EventType
	KV      KV
	PrevKV  *KV
	Latency time.Duration
}

type EventType int

const (
	EventPut EventType = iota
	EventDelete
)

type Store interface {
	Name() string
	Get(ctx context.Context, key string) (*KV, error)
	Put(ctx context.Context, key string, value []byte) error
	Delete(ctx context.Context, key string) error
	BatchGet(ctx context.Context, keys []string) ([]*KV, error)
	BatchPut(ctx context.Context, kvs []KV) error
	List(ctx context.Context, prefix string, limit int) ([]*KV, error)
	Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error)
	Setup(ctx context.Context) error
	Teardown(ctx context.Context) error
	io.Closer
}

type Factory func(cfg any) (Store, error)

var factories = map[string]Factory{}

func Register(name string, f Factory) {
	factories[name] = f
}

func New(name string, cfg any) (Store, error) {
	f, ok := factories[name]
	if !ok {
		return nil, fmt.Errorf("unknown store: %s", name)
	}
	return f(cfg)
}

func Available() []string {
	names := make([]string, 0, len(factories))
	for name := range factories {
		names = append(names, name)
	}
	return names
}
