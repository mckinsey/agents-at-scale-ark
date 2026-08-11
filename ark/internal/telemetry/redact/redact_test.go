/* Copyright 2025. McKinsey & Company */

package redact

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type fixtures struct {
	Redacted []struct {
		Name   string   `json:"name"`
		Input  string   `json:"input"`
		Absent []string `json:"absent"`
	} `json:"redacted"`
	Preserved []struct {
		Name    string   `json:"name"`
		Input   string   `json:"input"`
		Present []string `json:"present"`
	} `json:"preserved"`
}

func loadSharedFixtures(t *testing.T) fixtures {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve test file path")
	}
	path := filepath.Join(filepath.Dir(file), "testdata", "credential-redaction.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read shared fixtures %s: %v", path, err)
	}
	var f fixtures
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatalf("parse shared fixtures: %v", err)
	}
	if len(f.Redacted) == 0 || len(f.Preserved) == 0 {
		t.Fatal("shared fixtures appear empty")
	}
	return f
}

func TestRedactSharedFixtures(t *testing.T) {
	f := loadSharedFixtures(t)
	for _, tc := range f.Redacted {
		t.Run("redacted/"+tc.Name, func(t *testing.T) {
			got := Redact(tc.Input)
			for _, a := range tc.Absent {
				if strings.Contains(got, a) {
					t.Errorf("expected %q redacted, got %q", a, got)
				}
			}
			if !strings.Contains(got, redactedPlaceholder) {
				t.Errorf("expected %s marker, got %q", redactedPlaceholder, got)
			}
		})
	}
	for _, tc := range f.Preserved {
		t.Run("preserved/"+tc.Name, func(t *testing.T) {
			got := Redact(tc.Input)
			for _, p := range tc.Present {
				if !strings.Contains(got, p) {
					t.Errorf("expected %q preserved, got %q", p, got)
				}
			}
		})
	}
}

// Shape tokens are assembled at runtime so no secret-shaped literal is committed (server
// scanners flag committed JWTs/PATs even when fake). Do not inline these as literals.
func TestRedactShapeTokens(t *testing.T) {
	rep := strings.Repeat
	tokens := []string{
		"eyJ" + rep("a", 12) + ".eyJ" + rep("b", 12) + "." + rep("c", 20), // JWT
		"sk-" + rep("A", 48),         // OpenAI/Anthropic
		"ghp_" + rep("A", 36),        // GitHub
		"github_pat_" + rep("A", 24), // GitHub PAT
		"AKIA" + rep("A", 16),        // AWS
		"AIza" + rep("A", 35),        // Google
		"xoxb-" + rep("A", 12),       // Slack
		"sk_live_" + rep("A", 20),    // Stripe
		"-----BEGIN RSA PRIVATE KEY-----\n" + rep("A", 24) + "\n-----END RSA PRIVATE KEY-----", // PEM
		"00000000-0000-0000-0000-000000000000:" + rep("A", 24),                                 // McKinsey Service Credential
	}
	for _, tok := range tokens {
		got := Redact("lead " + tok + " trail")
		if strings.Contains(got, tok) {
			t.Errorf("expected shape token redacted: %q -> %q", tok, got)
		}
		if !strings.Contains(got, redactedPlaceholder) {
			t.Errorf("expected %s for %q, got %q", redactedPlaceholder, tok, got)
		}
	}

	// Basic-auth value (named key) must be fully redacted, not just the scheme word.
	if got := Redact("authorization: Basic " + rep("A", 24)); strings.Contains(got, rep("A", 24)) {
		t.Errorf("expected Basic auth value redacted, got %q", got)
	}
	// A UUID followed by a short value (e.g. a port) is not a credential.
	if got := Redact("id 00000000-0000-0000-0000-000000000000:8080 ok"); !strings.Contains(got, ":8080") {
		t.Errorf("expected uuid:short-value preserved, got %q", got)
	}
}

func BenchmarkRedact(b *testing.B) {
	cases := []struct {
		name  string
		input string
	}{
		{"no_match", "role=assistant model=gpt-4o namespace=default query.name=summarize-q3"},
		{"key_anchored", "authorization: Bearer abc123 and access_token=secret123"},
		{"shape", "here is a bare " + "ghp_" + strings.Repeat("A", 36) + " token"},
	}
	for _, tc := range cases {
		b.Run(tc.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_ = Redact(tc.input)
			}
		})
	}
}

func TestRedactIdempotent(t *testing.T) {
	for _, in := range []string{
		"access_token=secret123",
		"bare " + "ghp_" + strings.Repeat("A", 36) + " here",
	} {
		once := Redact(in)
		if twice := Redact(once); once != twice {
			t.Errorf("not idempotent for %q: %q vs %q", in, once, twice)
		}
	}
}
