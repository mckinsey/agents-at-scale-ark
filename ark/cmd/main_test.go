/* Copyright 2025. McKinsey & Company */

package main

import (
	"flag"
	"os"
	"strings"
	"testing"

	"mckinsey.com/ark/internal/apiserver"
	"sigs.k8s.io/controller-runtime/pkg/log/zap"
)

func TestValidateRole(t *testing.T) {
	cases := []struct {
		role    string
		wantErr string
	}{
		{"apiserver", ""},
		{"controller", ""},
		{"", "is required"},
		{"combined", "is invalid"},
		{"APISERVER", "is invalid"},
		{"api-server", "is invalid"},
	}
	for _, c := range cases {
		err := validateRole(c.role)
		if c.wantErr == "" {
			if err != nil {
				t.Errorf("validateRole(%q) = %v, want nil", c.role, err)
			}
			continue
		}
		if err == nil {
			t.Errorf("validateRole(%q) = nil, want error containing %q", c.role, c.wantErr)
			continue
		}
		if !strings.Contains(err.Error(), c.wantErr) {
			t.Errorf("validateRole(%q) error = %q, want substring %q", c.role, err.Error(), c.wantErr)
		}
	}
}

// runParseFlags resets flag state, sets os.Args, and invokes parseFlags so each
// subtest gets an isolated FlagSet.
func runParseFlags(t *testing.T, args []string) struct {
	config
	zapOpts     zap.Options
	showVersion bool
} {
	t.Helper()
	oldArgs := os.Args
	oldFlagSet := flag.CommandLine
	t.Cleanup(func() {
		os.Args = oldArgs
		flag.CommandLine = oldFlagSet
	})
	flag.CommandLine = flag.NewFlagSet("test", flag.ContinueOnError)
	os.Args = args
	return parseFlags()
}

func TestParseFlags(t *testing.T) {
	cases := []struct {
		name            string
		args            []string
		wantConfig      config
		wantShowVersion bool
	}{
		{
			name: "defaults when flags omitted",
			args: []string{"cmd"},
			wantConfig: config{
				metricsAddr:             "0",
				probeAddr:               ":8081",
				secureMetrics:           true,
				webhookCertName:         "tls.crt",
				webhookCertKey:          "tls.key",
				metricsCertName:         "tls.crt",
				metricsCertKey:          "tls.key",
				completionsAddr:         "http://ark-completions.ark-system",
				maxConcurrentQueries:    32,
				maxConcurrentReconciles: 4,
			},
		},
		{
			name: "every flag overridden",
			args: []string{
				"cmd",
				"--metrics-bind-address=:9000",
				"--health-probe-bind-address=:9001",
				"--leader-elect=true",
				"--metrics-secure=false",
				"--webhook-cert-path=/tmp/webhook",
				"--webhook-cert-name=webhook.crt",
				"--webhook-cert-key=webhook.key",
				"--metrics-cert-path=/tmp/metrics",
				"--metrics-cert-name=metrics.crt",
				"--metrics-cert-key=metrics.key",
				"--enable-http2=true",
				"--version=true",
				"--completions-addr=http://example.local",
				"--role=apiserver",
				"--max-concurrent-queries=10",
				"--max-concurrent-reconciles=5",
			},
			wantConfig: config{
				metricsAddr:             ":9000",
				probeAddr:               ":9001",
				enableLeaderElection:    true,
				secureMetrics:           false,
				webhookCertPath:         "/tmp/webhook",
				webhookCertName:         "webhook.crt",
				webhookCertKey:          "webhook.key",
				metricsCertPath:         "/tmp/metrics",
				metricsCertName:         "metrics.crt",
				metricsCertKey:          "metrics.key",
				enableHTTP2:             true,
				completionsAddr:         "http://example.local",
				role:                    "apiserver",
				maxConcurrentQueries:    10,
				maxConcurrentReconciles: 5,
			},
			wantShowVersion: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			result := runParseFlags(t, c.args)
			if result.config != c.wantConfig {
				t.Errorf("config mismatch\n got: %+v\nwant: %+v", result.config, c.wantConfig)
			}
			if result.showVersion != c.wantShowVersion {
				t.Errorf("showVersion = %v, want %v", result.showVersion, c.wantShowVersion)
			}
		})
	}
}

func TestApiserverConfigFromEnv(t *testing.T) {
	envKeys := []string{
		"ARK_APISERVER_PORT",
		"ARK_POSTGRES_HOST",
		"ARK_POSTGRES_PORT",
		"ARK_POSTGRES_DATABASE",
		"ARK_POSTGRES_USER",
		"ARK_POSTGRES_PASSWORD",
		"ARK_POSTGRES_SSL_MODE",
		"ARK_APISERVER_AUTH_MODE",
		"ARK_APISERVER_TLS_CERT_FILE",
		"ARK_APISERVER_TLS_KEY_FILE",
		"ARK_POSTGRES_SSL_ROOT_CERT",
		"ARK_POSTGRES_SSL_CERT",
		"ARK_POSTGRES_SSL_KEY",
	}

	cases := []struct {
		name    string
		env     map[string]string
		want    apiserver.Config
		wantErr string
	}{
		{
			name: "defaults when env unset",
			env:  map[string]string{},
			want: apiserver.Config{PostgresSSL: "require"},
		},
		{
			name: "every variable set",
			env: map[string]string{
				"ARK_APISERVER_PORT":          "8443",
				"ARK_POSTGRES_HOST":           "db.example.com",
				"ARK_POSTGRES_PORT":           "5433",
				"ARK_POSTGRES_DATABASE":       "ark",
				"ARK_POSTGRES_USER":           "ark",
				"ARK_POSTGRES_PASSWORD":       "secret",
				"ARK_POSTGRES_SSL_MODE":       "verify-full",
				"ARK_APISERVER_AUTH_MODE":     "delegated",
				"ARK_APISERVER_TLS_CERT_FILE": "/certs/tls.crt",
				"ARK_APISERVER_TLS_KEY_FILE":  "/certs/tls.key",
				"ARK_POSTGRES_SSL_ROOT_CERT":  "/etc/ark/postgres-tls/ca.crt",
				"ARK_POSTGRES_SSL_CERT":       "/etc/ark/postgres-tls/tls.crt",
				"ARK_POSTGRES_SSL_KEY":        "/etc/ark/postgres-tls/tls.key",
			},
			want: apiserver.Config{
				BindPort:        8443,
				PostgresHost:    "db.example.com",
				PostgresPort:    5433,
				PostgresDB:      "ark",
				PostgresUser:    "ark",
				PostgresPass:    "secret",
				PostgresSSL:     "verify-full",
				AuthMode:        "delegated",
				TLSCertFile:     "/certs/tls.crt",
				TLSKeyFile:      "/certs/tls.key",
				PostgresSSLRoot: "/etc/ark/postgres-tls/ca.crt",
				PostgresSSLCert: "/etc/ark/postgres-tls/tls.crt",
				PostgresSSLKey:  "/etc/ark/postgres-tls/tls.key",
			},
		},
		{
			name:    "invalid apiserver port",
			env:     map[string]string{"ARK_APISERVER_PORT": "not-a-port"},
			wantErr: "ARK_APISERVER_PORT",
		},
		{
			name:    "invalid postgres port",
			env:     map[string]string{"ARK_POSTGRES_PORT": "5432a"},
			wantErr: "ARK_POSTGRES_PORT",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			for _, key := range envKeys {
				t.Setenv(key, c.env[key])
			}
			got, err := apiserverConfigFromEnv()
			if c.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), c.wantErr) {
					t.Fatalf("error = %v, want mention of %q", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != c.want {
				t.Errorf("config mismatch\n got: %+v\nwant: %+v", got, c.want)
			}
		})
	}
}

func TestLeaderElectionID(t *testing.T) {
	cases := []struct {
		role string
		want string
	}{
		{"apiserver", "ark-apiserver-leader"},
		{"controller", "ark-controller-leader"},
	}
	for _, c := range cases {
		got := leaderElectionID(c.role)
		if got != c.want {
			t.Errorf("leaderElectionID(%q) = %q, want %q", c.role, got, c.want)
		}
	}
}
