/* Copyright 2025. McKinsey & Company */

package postgresql

import (
	"strings"
	"testing"
)

func TestPoolSizes(t *testing.T) {
	tests := []struct {
		name         string
		cfg          Config
		wantOpen     int
		wantIdle     int
		wantErrMatch string
	}{
		{name: "zero value keeps the default of 40", cfg: Config{}, wantOpen: 40, wantIdle: 20},
		{name: "configured value is used", cfg: Config{MaxOpenConns: 100}, wantOpen: 100, wantIdle: 50},
		{name: "idle defaults to half of a small pool", cfg: Config{MaxOpenConns: 10}, wantOpen: 10, wantIdle: 5},
		{name: "a pool of one still keeps one idle connection", cfg: Config{MaxOpenConns: 1}, wantOpen: 1, wantIdle: 1},
		{name: "explicit idle is respected", cfg: Config{MaxOpenConns: 20, MaxIdleConns: 3}, wantOpen: 20, wantIdle: 3},
		{name: "negative open is rejected, not treated as unlimited", cfg: Config{MaxOpenConns: -1}, wantErrMatch: "MaxOpenConns"},
		{name: "negative idle is rejected", cfg: Config{MaxOpenConns: 10, MaxIdleConns: -1}, wantErrMatch: "MaxIdleConns"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			open, idle, err := poolSizes(tt.cfg)
			if tt.wantErrMatch != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErrMatch) {
					t.Fatalf("error = %v, want mention of %q", err, tt.wantErrMatch)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if open != tt.wantOpen || idle != tt.wantIdle {
				t.Errorf("poolSizes() = (%d, %d), want (%d, %d)", open, idle, tt.wantOpen, tt.wantIdle)
			}
		})
	}
}

func TestNewRejectsNegativePoolBeforeOpeningConnection(t *testing.T) {
	_, err := New(Config{Host: "127.0.0.1", Port: 1, MaxOpenConns: -5}, nil)
	if err == nil || !strings.Contains(err.Error(), "MaxOpenConns") {
		t.Fatalf("error = %v, want a MaxOpenConns validation error", err)
	}
}
