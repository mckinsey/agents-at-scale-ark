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
		{"postgres-cleanup", ""},
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
				metricsAddr:                "0",
				probeAddr:                  ":8081",
				secureMetrics:              true,
				webhookCertName:            "tls.crt",
				webhookCertKey:             "tls.key",
				metricsCertName:            "tls.crt",
				metricsCertKey:             "tls.key",
				completionsAddr:            "http://ark-completions.ark-system",
				maxConcurrentQueries:       32,
				maxConcurrentReconciles:    4,
				defaultMemoryAutoProvision: true,
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
				metricsAddr:                ":9000",
				probeAddr:                  ":9001",
				enableLeaderElection:       true,
				secureMetrics:              false,
				webhookCertPath:            "/tmp/webhook",
				webhookCertName:            "webhook.crt",
				webhookCertKey:             "webhook.key",
				metricsCertPath:            "/tmp/metrics",
				metricsCertName:            "metrics.crt",
				metricsCertKey:             "metrics.key",
				enableHTTP2:                true,
				completionsAddr:            "http://example.local",
				role:                       "apiserver",
				maxConcurrentQueries:       10,
				maxConcurrentReconciles:    5,
				defaultMemoryAutoProvision: true,
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
		"ARK_APISERVER_AUDIT_ENABLED",
		"ARK_APISERVER_AUDIT_POLICY_FILE",
		"ARK_APISERVER_AUDIT_LOG_PATH",
		"ARK_APISERVER_POLICY_CEL_ENABLED",
		"ARK_APISERVER_POLICY_CEL_REQUIRED",
		"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_ENABLED",
		"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED",
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
			// Off with no env: audit is "on by default" only once a policy file exists.
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: false, AuditLogPath: "-"},
		},
		{
			name: "audit defaults on once a policy file is configured",
			env:  map[string]string{"ARK_APISERVER_AUDIT_POLICY_FILE": "/etc/ark/audit/policy.yaml"},
			want: apiserver.Config{
				PostgresSSL:     "require",
				AuditEnabled:    true,
				AuditPolicyFile: "/etc/ark/audit/policy.yaml",
				AuditLogPath:    "-",
			},
		},
		{
			// Not downgraded to off: applyAudit turns this into a startup error instead.
			name: "explicit audit opt-in without a policy file stays enabled",
			env:  map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: true, AuditLogPath: "-"},
		},
		{
			name: "CEL enforcement can be made a startup requirement",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_REQUIRED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-", CELRequired: true},
		},
		{
			name:    "invalid CEL required bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_CEL_REQUIRED": "sometimes"},
			wantErr: "ARK_APISERVER_POLICY_CEL_REQUIRED",
		},
		{
			// Enabled is the default, so only an explicit opt-out sets CELDisabled.
			name: "CEL enforcement can be switched off",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "false"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-", CELDisabled: true},
		},
		{
			name: "CEL enabled explicitly leaves enforcement wired",
			env:  map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "true"},
			want: apiserver.Config{PostgresSSL: "require", AuditLogPath: "-"},
		},
		{
			name:    "invalid CEL enabled bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_CEL_ENABLED": "maybe"},
			wantErr: "ARK_APISERVER_POLICY_CEL_ENABLED",
		},
		{
			// The combination one shared flag could not express: webhooks mandatory with CEL
			// left at its best-effort default.
			name: "third-party webhooks can be required independently of CEL",
			env: map[string]string{
				"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_ENABLED":  "true",
				"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED": "true",
			},
			want: apiserver.Config{
				PostgresSSL: "require", AuditLogPath: "-",
				ThirdPartyWebhooks: true, ThirdPartyWebhooksRequired: true,
			},
		},
		{
			name:    "invalid third-party webhooks required bool",
			env:     map[string]string{"ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED": "sometimes"},
			wantErr: "ARK_APISERVER_POLICY_THIRD_PARTY_WEBHOOKS_REQUIRED",
		},
		{
			name: "every variable set",
			env: map[string]string{
				"ARK_APISERVER_PORT":              "8443",
				"ARK_POSTGRES_HOST":               "db.example.com",
				"ARK_POSTGRES_PORT":               "5433",
				"ARK_POSTGRES_DATABASE":           "ark",
				"ARK_POSTGRES_USER":               "ark",
				"ARK_POSTGRES_PASSWORD":           "secret",
				"ARK_POSTGRES_SSL_MODE":           "verify-full",
				"ARK_APISERVER_AUTH_MODE":         "delegated",
				"ARK_APISERVER_TLS_CERT_FILE":     "/certs/tls.crt",
				"ARK_APISERVER_TLS_KEY_FILE":      "/certs/tls.key",
				"ARK_POSTGRES_SSL_ROOT_CERT":      "/etc/ark/postgres-tls/ca.crt",
				"ARK_POSTGRES_SSL_CERT":           "/etc/ark/postgres-tls/tls.crt",
				"ARK_POSTGRES_SSL_KEY":            "/etc/ark/postgres-tls/tls.key",
				"ARK_APISERVER_AUDIT_ENABLED":     "true",
				"ARK_APISERVER_AUDIT_POLICY_FILE": "/etc/ark/audit/policy.yaml",
				"ARK_APISERVER_AUDIT_LOG_PATH":    "/var/log/ark/audit.log",
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
				AuditEnabled:    true,
				AuditPolicyFile: "/etc/ark/audit/policy.yaml",
				AuditLogPath:    "/var/log/ark/audit.log",
			},
		},
		{
			name: "audit can be disabled",
			env:  map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "false"},
			want: apiserver.Config{PostgresSSL: "require", AuditEnabled: false, AuditLogPath: "-"},
		},
		{
			name:    "invalid audit enabled bool",
			env:     map[string]string{"ARK_APISERVER_AUDIT_ENABLED": "maybe"},
			wantErr: "ARK_APISERVER_AUDIT_ENABLED",
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

func TestPostgresCleanupConfig(t *testing.T) {
	for _, k := range []string{
		"ARK_POSTGRES_HOST", "ARK_POSTGRES_DATABASE", "ARK_POSTGRES_USER",
		"ARK_POSTGRES_PASSWORD", "ARK_POSTGRES_SSL_MODE", "ARK_POSTGRES_PORT",
		"ARK_POSTGRES_SSL_ROOT_CERT", "ARK_POSTGRES_SSL_CERT", "ARK_POSTGRES_SSL_KEY",
	} {
		t.Setenv(k, "")
	}

	t.Run("reads env", func(t *testing.T) {
		t.Setenv("ARK_POSTGRES_HOST", "db")
		t.Setenv("ARK_POSTGRES_DATABASE", "ark")
		t.Setenv("ARK_POSTGRES_USER", "ark")
		t.Setenv("ARK_POSTGRES_PASSWORD", "pw")
		t.Setenv("ARK_POSTGRES_SSL_MODE", "verify-full")
		t.Setenv("ARK_POSTGRES_PORT", "6000")
		t.Setenv("ARK_POSTGRES_SSL_ROOT_CERT", "/etc/ark/postgres-tls/ca.crt")
		t.Setenv("ARK_POSTGRES_SSL_CERT", "/etc/ark/postgres-tls/tls.crt")
		t.Setenv("ARK_POSTGRES_SSL_KEY", "/etc/ark/postgres-tls/tls.key")

		cfg := postgresCleanupConfig()
		if cfg.Host != "db" || cfg.Database != "ark" || cfg.User != "ark" ||
			cfg.Password != "pw" || cfg.SSLMode != "verify-full" || cfg.Port != 6000 ||
			cfg.SSLRootCert != "/etc/ark/postgres-tls/ca.crt" ||
			cfg.SSLCert != "/etc/ark/postgres-tls/tls.crt" ||
			cfg.SSLKey != "/etc/ark/postgres-tls/tls.key" {
			t.Errorf("unexpected config: %+v", cfg)
		}
	})

	t.Run("port left zero when unset or invalid", func(t *testing.T) {
		t.Setenv("ARK_POSTGRES_PORT", "")
		if cfg := postgresCleanupConfig(); cfg.Port != 0 {
			t.Errorf("Port = %d, want 0 (defaulted downstream)", cfg.Port)
		}
		t.Setenv("ARK_POSTGRES_PORT", "not-a-number")
		if cfg := postgresCleanupConfig(); cfg.Port != 0 {
			t.Errorf("Port = %d, want 0 for invalid input", cfg.Port)
		}
	})
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
