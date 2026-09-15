/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestServerReadyz_NotInitialized(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if err := s.Readyz(httptest.NewRequest(http.MethodGet, "/readyz", nil)); err == nil {
		t.Fatal("expected error before backend is initialized")
	}
}

func TestStorageReady(t *testing.T) {
	t.Parallel()

	ready := make(chan struct{})
	close(ready)

	t.Run("backend healthy", func(t *testing.T) {
		if err := storageReady(context.Background(), ready, func(context.Context) error { return nil }); err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	})

	t.Run("backend unhealthy", func(t *testing.T) {
		pingErr := errors.New("db down")
		err := storageReady(context.Background(), ready, func(context.Context) error { return pingErr })
		if !errors.Is(err, pingErr) {
			t.Fatalf("expected ping error, got %v", err)
		}
	})

	t.Run("hanging ping bounded by timeout", func(t *testing.T) {
		start := time.Now()
		err := storageReady(context.Background(), ready, func(ctx context.Context) error {
			<-ctx.Done()
			return ctx.Err()
		})
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("expected deadline exceeded, got %v", err)
		}
		if elapsed := time.Since(start); elapsed > readyzPingTimeout+time.Second {
			t.Fatalf("storageReady took %v, want ~%v", elapsed, readyzPingTimeout)
		}
	})

	// lib/pq observes only its connect_timeout while it is establishing a connection, so
	// a ping to an unreachable or wedged database ignores the context and returns after
	// connect_timeout — 10s. The readiness deadline has to hold without the ping's help.
	t.Run("ping that ignores its context is still bounded", func(t *testing.T) {
		start := time.Now()
		err := storageReady(context.Background(), ready, func(context.Context) error {
			time.Sleep(10 * time.Second)
			return nil
		})
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("expected deadline exceeded, got %v", err)
		}
		if elapsed := time.Since(start); elapsed > readyzPingTimeout+time.Second {
			t.Fatalf("storageReady took %v, want ~%v", elapsed, readyzPingTimeout)
		}
	})

	t.Run("request cancellation returns without waiting for the ping", func(t *testing.T) {
		parent, cancel := context.WithCancel(context.Background())
		go func() {
			time.Sleep(50 * time.Millisecond)
			cancel()
		}()

		start := time.Now()
		err := storageReady(parent, ready, func(context.Context) error {
			time.Sleep(10 * time.Second)
			return nil
		})
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("expected canceled, got %v", err)
		}
		if elapsed := time.Since(start); elapsed > time.Second {
			t.Fatalf("storageReady took %v after cancellation, want a prompt return", elapsed)
		}
	})

	t.Run("cancellation reaches the ping", func(t *testing.T) {
		parent, cancel := context.WithCancel(context.Background())
		cancel()

		err := storageReady(parent, ready, func(ctx context.Context) error { return ctx.Err() })
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("ping did not see the cancelled request context, got %v", err)
		}
	})

	t.Run("not ready skips ping", func(t *testing.T) {
		notReady := make(chan struct{})
		err := storageReady(context.Background(), notReady, func(context.Context) error {
			t.Error("ping must not run before backend is ready")
			return nil
		})
		if err == nil {
			t.Fatal("expected error when backend is not ready")
		}
	})
}
