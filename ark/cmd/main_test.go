/* Copyright 2025. McKinsey & Company */

package main

import (
	"flag"
	"os"
	"strings"
	"testing"

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
