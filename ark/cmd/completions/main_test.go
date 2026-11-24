package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestServerConfigFromEnv(t *testing.T) {
	tests := []struct {
		name       string
		env        map[string]string
		wantExpiry time.Duration
	}{
		{
			name:       "no env: empty redis config, default expiry",
			env:        map[string]string{},
			wantExpiry: 0,
		},
		{
			name: "full redis config with valid expiry",
			env: map[string]string{
				"REDIS_URL":                 "rediss://:pass@redis:6379/2",
				"REDIS_PASSWORD":            "override",
				"REDIS_TLS_CA_CERT_PATH":    "/etc/ssl/certs/redis-ca/ca.crt",
				"REDIS_TASK_EXPIRY_SECONDS": "120",
			},
			wantExpiry: 120 * time.Second,
		},
		{
			name:       "non-numeric expiry is ignored",
			env:        map[string]string{"REDIS_TASK_EXPIRY_SECONDS": "abc"},
			wantExpiry: 0,
		},
		{
			name:       "zero/negative expiry is ignored",
			env:        map[string]string{"REDIS_TASK_EXPIRY_SECONDS": "-5"},
			wantExpiry: 0,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for k, v := range tc.env {
				t.Setenv(k, v)
			}

			cfg := serverConfigFromEnv(":9090")

			assert.Equal(t, ":9090", cfg.Addr)
			assert.Equal(t, tc.env["REDIS_URL"], cfg.RedisURL)
			assert.Equal(t, tc.env["REDIS_PASSWORD"], cfg.RedisPassword)
			assert.Equal(t, tc.env["REDIS_TLS_CA_CERT_PATH"], cfg.RedisCACertPath)
			assert.Equal(t, tc.wantExpiry, cfg.TaskExpiry)
		})
	}
}
