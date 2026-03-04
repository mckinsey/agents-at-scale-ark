package store

import (
	"context"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

func init() {
	Register("etcd", func(cfg any) (Store, error) {
		c := cfg.(*EtcdConfig)
		return NewEtcd(c)
	})
}

type EtcdConfig struct {
	Endpoints []string
	Prefix    string
}

type etcdStore struct {
	client *clientv3.Client
	prefix string
}

func NewEtcd(cfg *EtcdConfig) (Store, error) {
	client, err := clientv3.New(clientv3.Config{
		Endpoints:   cfg.Endpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, err
	}
	return &etcdStore{client: client, prefix: cfg.Prefix}, nil
}

func (s *etcdStore) Name() string { return "etcd" }

func (s *etcdStore) Get(ctx context.Context, key string) (*KV, error) {
	resp, err := s.client.Get(ctx, s.prefix+key)
	if err != nil {
		return nil, err
	}
	if len(resp.Kvs) == 0 {
		return nil, nil
	}
	kv := resp.Kvs[0]
	return &KV{
		Key:     string(kv.Key)[len(s.prefix):],
		Value:   kv.Value,
		Version: kv.ModRevision,
	}, nil
}

func (s *etcdStore) Put(ctx context.Context, key string, value []byte) error {
	_, err := s.client.Put(ctx, s.prefix+key, string(value))
	return err
}

func (s *etcdStore) Delete(ctx context.Context, key string) error {
	_, err := s.client.Delete(ctx, s.prefix+key)
	return err
}

func (s *etcdStore) BatchGet(ctx context.Context, keys []string) ([]*KV, error) {
	ops := make([]clientv3.Op, len(keys))
	for i, k := range keys {
		ops[i] = clientv3.OpGet(s.prefix + k)
	}
	resp, err := s.client.Txn(ctx).Then(ops...).Commit()
	if err != nil {
		return nil, err
	}
	result := make([]*KV, 0, len(keys))
	for _, r := range resp.Responses {
		for _, kv := range r.GetResponseRange().Kvs {
			result = append(result, &KV{
				Key:     string(kv.Key)[len(s.prefix):],
				Value:   kv.Value,
				Version: kv.ModRevision,
			})
		}
	}
	return result, nil
}

func (s *etcdStore) BatchPut(ctx context.Context, kvs []KV) error {
	ops := make([]clientv3.Op, len(kvs))
	for i, kv := range kvs {
		ops[i] = clientv3.OpPut(s.prefix+kv.Key, string(kv.Value))
	}
	_, err := s.client.Txn(ctx).Then(ops...).Commit()
	return err
}

func (s *etcdStore) List(ctx context.Context, prefix string, limit int) ([]*KV, error) {
	opts := []clientv3.OpOption{clientv3.WithPrefix()}
	if limit > 0 {
		opts = append(opts, clientv3.WithLimit(int64(limit)))
	}
	resp, err := s.client.Get(ctx, s.prefix+prefix, opts...)
	if err != nil {
		return nil, err
	}
	result := make([]*KV, len(resp.Kvs))
	for i, kv := range resp.Kvs {
		result[i] = &KV{
			Key:     string(kv.Key)[len(s.prefix):],
			Value:   kv.Value,
			Version: kv.ModRevision,
		}
	}
	return result, nil
}

func (s *etcdStore) Watch(ctx context.Context, prefix string) (<-chan WatchEvent, error) {
	ch := make(chan WatchEvent, 100)
	watchCh := s.client.Watch(ctx, s.prefix+prefix, clientv3.WithPrefix())

	go func() {
		defer close(ch)
		for resp := range watchCh {
			receiveTime := time.Now()
			for _, ev := range resp.Events {
				event := WatchEvent{
					KV: KV{
						Key:     string(ev.Kv.Key)[len(s.prefix):],
						Value:   ev.Kv.Value,
						Version: ev.Kv.ModRevision,
					},
				}
				if ev.Type == clientv3.EventTypeDelete {
					event.Type = EventDelete
				}
				if ev.PrevKv != nil {
					event.PrevKV = &KV{
						Key:   string(ev.PrevKv.Key)[len(s.prefix):],
						Value: ev.PrevKv.Value,
					}
				}
				event.Latency = time.Since(receiveTime)
				ch <- event
			}
		}
	}()
	return ch, nil
}

func (s *etcdStore) Setup(ctx context.Context) error {
	_, err := s.client.Delete(ctx, s.prefix, clientv3.WithPrefix())
	return err
}

func (s *etcdStore) Teardown(ctx context.Context) error {
	_, err := s.client.Delete(ctx, s.prefix, clientv3.WithPrefix())
	return err
}

func (s *etcdStore) Close() error {
	return s.client.Close()
}
