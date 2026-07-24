/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestServerReadyz_NotInitialized(t *testing.T) {
	t.Parallel()

	s := New(Config{})
	if err := s.Readyz(nil); err == nil {
		t.Fatal("expected error before backend is initialized")
	}
}

func TestStorageReady(t *testing.T) {
	t.Parallel()

	ready := make(chan struct{})
	close(ready)

	t.Run("backend healthy", func(t *testing.T) {
		if err := storageReady(ready, func(context.Context) error { return nil }); err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	})

	t.Run("backend unhealthy", func(t *testing.T) {
		pingErr := errors.New("db down")
		if err := storageReady(ready, func(context.Context) error { return pingErr }); !errors.Is(err, pingErr) {
			t.Fatalf("expected ping error, got %v", err)
		}
	})

	t.Run("hanging ping bounded by timeout", func(t *testing.T) {
		start := time.Now()
		err := storageReady(ready, func(ctx context.Context) error {
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

	t.Run("not ready skips ping", func(t *testing.T) {
		notReady := make(chan struct{})
		err := storageReady(notReady, func(context.Context) error {
			t.Error("ping must not run before backend is ready")
			return nil
		})
		if err == nil {
			t.Fatal("expected error when backend is not ready")
		}
	})
}
