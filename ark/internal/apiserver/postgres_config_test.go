/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"context"
	"strings"
	"testing"
	"time"

	"mckinsey.com/ark/internal/storage/postgresql"
)

func TestConfigPostgresConfigPassesEveryField(t *testing.T) {
	cfg := Config{
		PostgresHost:         "db.example.com",
		PostgresPort:         5433,
		PostgresDB:           "ark",
		PostgresUser:         "ark",
		PostgresPass:         "secret",
		PostgresSSL:          "verify-full",
		PostgresSSLRoot:      "/etc/ark/postgres-tls/ca.crt",
		PostgresSSLCert:      "/etc/ark/postgres-tls/tls.crt",
		PostgresSSLKey:       "/etc/ark/postgres-tls/tls.key",
		PostgresMaxOpenConns: 120,
	}

	want := postgresql.Config{
		Host:         "db.example.com",
		Port:         5433,
		Database:     "ark",
		User:         "ark",
		Password:     "secret",
		SSLMode:      "verify-full",
		SSLRootCert:  "/etc/ark/postgres-tls/ca.crt",
		SSLCert:      "/etc/ark/postgres-tls/tls.crt",
		SSLKey:       "/etc/ark/postgres-tls/tls.key",
		MaxOpenConns: 120,
	}

	if got := cfg.postgresConfig(); got != want {
		t.Errorf("postgresConfig() mismatch\n got: %+v\nwant: %+v", got, want)
	}
}

func TestConfigPostgresConfigLeavesPoolUnsetByDefault(t *testing.T) {
	if got := (Config{}).postgresConfig().MaxOpenConns; got != 0 {
		t.Errorf("MaxOpenConns = %d, want 0 so the storage default applies", got)
	}
}

func TestServerStartPassesPoolSizeToStorage(t *testing.T) {
	srv := New(Config{
		PostgresHost:         "127.0.0.1",
		PostgresPort:         1,
		PostgresDB:           "ark",
		PostgresUser:         "ark",
		PostgresSSL:          "disable",
		PostgresMaxOpenConns: -1,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	err := srv.Start(ctx)
	if err == nil {
		t.Fatal("Start() succeeded with a negative pool size, want an error")
	}
	if !strings.Contains(err.Error(), "MaxOpenConns") {
		t.Errorf("Start() error = %q, want the pool size check to reject the configured value", err)
	}
}
