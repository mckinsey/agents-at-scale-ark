/* Copyright 2025. McKinsey & Company */

package controller

import (
	"sync"

	"sigs.k8s.io/controller-runtime/pkg/client"
)

// impersonatedClientCache reuses impersonated Kubernetes clients across queries
// that share the same (namespace, serviceAccount) identity. get runs from
// concurrent query-execution goroutines, so the whole look-up/build/insert
// sequence is guarded by a single mutex: it is safe for concurrent use and the
// build for a new key happens exactly once.
type impersonatedClientCache struct {
	mu    sync.Mutex
	m     map[string]client.Client
	order []string
	max   int
	build func(namespace, serviceAccount string) (client.Client, error)
}

func newImpersonatedClientCache(max int, build func(namespace, serviceAccount string) (client.Client, error)) *impersonatedClientCache {
	return &impersonatedClientCache{
		m:     make(map[string]client.Client),
		max:   max,
		build: build,
	}
}

// get returns the cached client for the identity, building and caching one on a
// miss. When the cache is full it evicts the oldest inserted entry (FIFO); the
// bound keeps the cache from growing without limit across many distinct service
// accounts.
func (c *impersonatedClientCache) get(namespace, serviceAccount string) (client.Client, error) {
	key := namespace + "/" + serviceAccount

	c.mu.Lock()
	defer c.mu.Unlock()

	if cl, ok := c.m[key]; ok {
		return cl, nil
	}

	cl, err := c.build(namespace, serviceAccount)
	if err != nil {
		return nil, err
	}

	if c.max > 0 && len(c.m) >= c.max {
		delete(c.m, c.order[0])
		c.order = c.order[1:]
	}
	c.m[key] = cl
	c.order = append(c.order, key)

	return cl, nil
}
