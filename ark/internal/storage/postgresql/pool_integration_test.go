//go:build integration
// +build integration

/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestNewAppliesConfiguredPoolSize_Integration(t *testing.T) {
	tests := []struct {
		name         string
		maxOpenConns int
		want         int
	}{
		{name: "zero keeps the default", maxOpenConns: 0, want: defaultMaxOpenConns},
		{name: "configured value is enforced", maxOpenConns: 3, want: 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := testConfig(t)
			cfg.MaxOpenConns = tt.maxOpenConns

			backend, err := New(cfg, &integrationMockConverter{})
			if err != nil {
				t.Fatalf("Failed to create backend: %v", err)
			}
			defer backend.Close()

			if got := backend.db.Stats().MaxOpenConnections; got != tt.want {
				t.Fatalf("MaxOpenConnections = %d, want %d", got, tt.want)
			}

			ctx := context.Background()
			for i := 0; i < tt.want; i++ {
				conn, err := backend.db.Conn(ctx)
				if err != nil {
					t.Fatalf("connection %d of %d: %v", i+1, tt.want, err)
				}
				defer conn.Close()
			}

			waitCtx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
			defer cancel()
			if _, err := backend.db.Conn(waitCtx); !errors.Is(err, context.DeadlineExceeded) {
				t.Fatalf("connection %d should wait for a free slot, got err = %v", tt.want+1, err)
			}
		})
	}
}
