package modelurl

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateReportsRule(t *testing.T) {
	tests := []struct {
		name       string
		url        string
		whitelist  string
		privateIPs string
		rule       Rule
		message    string
	}{
		{"file scheme", "file:///etc/passwd", "", "", RuleScheme, "invalid URL format: unsupported scheme file://"},
		{"missing scheme", "api.openai.com/v1", "", "", RuleScheme, "invalid URL format: missing scheme"},
		{"missing hostname", "https:///v1", "", "", RuleHostname, "URL must contain a hostname"},
		{"plain HTTP to an external host", "http://api.openai.com/v1", "", "", RuleHTTPS, "all URLs must use HTTPS; got http://"},
		{"plain HTTP to loopback", "http://127.0.0.1:1", "", "", RuleHTTPS, "all URLs must use HTTPS; got http://"},
		{"loopback", "https://127.0.0.1/v1", "", "", RuleLoopback, "loopback IP addresses are not allowed: 127.0.0.1"},
		{"IPv6 loopback", "https://[::1]/v1", "", "", RuleLoopback, "loopback IP addresses are not allowed: ::1"},
		{"loopback inside an allowed range", "https://127.0.0.1/v1", "", "127.0.0.0/8", RuleLoopback, "loopback IP addresses are not allowed: 127.0.0.1"},
		{"metadata address", "https://169.254.169.254/latest", "", "169.254.0.0/16", RuleLinkLocal, "metadata service IP range is not allowed: 169.254.169.254"},
		{"private address", "https://10.0.0.1/v1", "", "", RulePrivateIP, "private IP addresses are not allowed: 10.0.0.1 (use ALLOWED_PRIVATE_IP_RANGES to allow specific ranges)"},
		{"private address outside the allowed range", "https://10.0.0.1/v1", "", "192.168.0.0/16", RulePrivateIP, "private IP addresses are not allowed: 10.0.0.1 (use ALLOWED_PRIVATE_IP_RANGES to allow specific ranges)"},
		{"host outside the allowlist", "https://models.example.org/v1", "api.openai.com\n# comment\napi.anthropic.com", "", RuleDomain, "domain not in whitelist: models.example.org (allowed domains: api.openai.com, api.anthropic.com)"},
		{"plain HTTP to a cluster.local host outside svc", "http://models.cluster.local/v1", "", "", RuleHTTPS, "all URLs must use HTTPS; got http://"},
		{"plain HTTP to a host ending in svc.cluster.local without a label boundary", "http://evilsvc.cluster.local/v1", "", "", RuleHTTPS, "all URLs must use HTTPS; got http://"},
		{"host sharing an allowlisted suffix without a label boundary", "https://evilexample.com/v1", "example.com", "", RuleDomain, "domain not in whitelist: evilexample.com (allowed domains: example.com)"},
		{"host sharing a wildcard suffix without a label boundary", "https://evilprod.example.com/v1", "*.prod.example.com", "", RuleDomain, "domain not in whitelist: evilprod.example.com (allowed domains: *.prod.example.com)"},
		{"loopback over HTTPS with a port", "https://127.0.0.1:1", "", "", RuleLoopback, "loopback IP addresses are not allowed: 127.0.0.1"},
		{"private address behind userinfo", "https://api.openai.com@10.0.0.1/v1", "", "", RulePrivateIP, "private IP addresses are not allowed: 10.0.0.1 (use ALLOWED_PRIVATE_IP_RANGES to allow specific ranges)"},
		{"IPv4-mapped loopback", "https://[::ffff:127.0.0.1]/v1", "", "", RuleLoopback, "loopback IP addresses are not allowed: 127.0.0.1"},
		{"cluster service outside the allowlist", "http://mock-llm.default.svc.cluster.local/v1", "api.openai.com", "", RuleDomain, "domain not in whitelist: mock-llm.default.svc.cluster.local (allowed domains: api.openai.com)"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(WhitelistedDomainsEnv, tt.whitelist)
			t.Setenv(AllowedPrivateIPRangeEnv, tt.privateIPs)

			err := Validate(tt.url)
			if err == nil {
				t.Fatalf("Validate(%q) = nil, want an error", tt.url)
			}
			rule, ok := RuleOf(err)
			if !ok {
				t.Fatalf("RuleOf(%v) found no rule", err)
			}
			if rule != tt.rule {
				t.Errorf("rule = %q, want %q", rule, tt.rule)
			}
			if err.Error() != tt.message {
				t.Errorf("message = %q, want %q", err.Error(), tt.message)
			}
		})
	}
}

func TestValidateRejectsUnparseableURL(t *testing.T) {
	err := Validate("https://exa mple.com/v1")
	rule, ok := RuleOf(err)
	if !ok || rule != RuleInvalidURL {
		t.Fatalf("RuleOf(%v) = %q, %v; want %q", err, rule, ok, RuleInvalidURL)
	}
	if !strings.HasPrefix(err.Error(), "invalid URL format: ") {
		t.Errorf("message = %q, want prefix %q", err.Error(), "invalid URL format: ")
	}
}

func TestValidateAccepts(t *testing.T) {
	tests := []struct {
		name       string
		url        string
		whitelist  string
		privateIPs string
	}{
		{"public HTTPS host", "https://api.openai.com/v1", "", ""},
		{"plain HTTP to a cluster service", "http://mock-llm.default.svc.cluster.local/v1", "", ""},
		{"host in the allowlist", "https://my-resource.openai.azure.com/openai", "openai.azure.com", ""},
		{"private address inside the allowed range", "https://10.100.50.10/v1", "", "10.100.50.0/24"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv(WhitelistedDomainsEnv, tt.whitelist)
			t.Setenv(AllowedPrivateIPRangeEnv, tt.privateIPs)

			if err := Validate(tt.url); err != nil {
				t.Fatalf("Validate(%q) = %v, want nil", tt.url, err)
			}
		})
	}
}

func TestRuleOfIgnoresOtherErrors(t *testing.T) {
	if _, ok := RuleOf(errors.New("other")); ok {
		t.Fatal("RuleOf reported a rule for an unrelated error")
	}
	if _, ok := RuleOf(nil); ok {
		t.Fatal("RuleOf reported a rule for nil")
	}
}

func TestErrorUnwrapsCause(t *testing.T) {
	err := Validate("https://exa mple.com/v1")
	if errors.Unwrap(errors.Unwrap(err)) == nil {
		t.Fatalf("expected the parse error to stay reachable through %v", err)
	}
}

func TestIsWhitelistedDomain(t *testing.T) {
	whitelist := []string{"api.openai.com", "openai.azure.com", "amazonaws.com"}

	tests := []struct {
		name     string
		hostname string
		want     bool
	}{
		{"Exact match", "api.openai.com", true},
		{"Subdomain", "my.openai.azure.com", true},
		{"AWS subdomain bedrock", "bedrock-runtime.us-east-1.amazonaws.com", true},
		{"Not in list", "evil.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isWhitelistedDomain(tt.hostname, whitelist)
			if got != tt.want {
				t.Errorf("isWhitelistedDomain(%s) = %v, want %v", tt.hostname, got, tt.want)
			}
		})
	}
}

func TestMatchDomainPattern(t *testing.T) {
	tests := []struct {
		name     string
		hostname string
		pattern  string
		want     bool
	}{
		{"Wildcard prefix match", "llm.prod.example.com", "*.prod.example.com", true},
		{"Wildcard base match", "prod.example.com", "*.prod.example.com", true},
		{"Wildcard no match", "dev.example.com", "*.prod.example.com", false},
		{"Exact match", "api.openai.com", "api.openai.com", true},
		{"Subdomain match", "sub.example.com", "example.com", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchDomainPattern(tt.hostname, tt.pattern)
			if got != tt.want {
				t.Errorf("matchDomainPattern(%s, %s) = %v, want %v", tt.hostname, tt.pattern, got, tt.want)
			}
		})
	}
}

func TestMatchWildcard(t *testing.T) {
	tests := []struct {
		name     string
		hostname string
		pattern  string
		want     bool
	}{
		{"pattern without wildcard matches exactly", "api.openai.com", "api.openai.com", true},
		{"pattern without wildcard rejects subdomain", "evil.api.openai.com", "api.openai.com", false},
		{"embedded wildcard matches", "api-eu.example.com", "api-*.example.com", true},
		{"embedded wildcard rejects wrong prefix", "web-eu.example.com", "api-*.example.com", false},
		{"embedded wildcard rejects wrong suffix", "api-eu.evil.com", "api-*.example.com", false},
		{"embedded wildcard rejects suffix appended to another domain", "api-eu.example.com.evil.com", "api-*.example.com", false},
		{"leading wildcard matches", "eu-prod.example.com", "*-prod.example.com", true},
		{"multiple wildcards never match", "api.eu.example.com", "api.*.*.example.com", false},
		{"overlapping prefix and suffix require distinct spans", "example.com", "example.com*example.com", false},
		{"wildcard spans label separators", "api-eu.internal.example.com", "api-*.example.com", true},
		{"bare wildcard matches any hostname", "evil.com", "*", true},
		{"trailing wildcard matches any parent domain", "api.example.com.evil.com", "api.example.*", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchWildcard(tt.hostname, tt.pattern)
			if got != tt.want {
				t.Errorf("matchWildcard(%s, %s) = %v, want %v", tt.hostname, tt.pattern, got, tt.want)
			}
		})
	}
}

func TestMatchDomainPatternDispatchesEmbeddedWildcard(t *testing.T) {
	tests := []struct {
		name     string
		hostname string
		pattern  string
		want     bool
	}{
		{"embedded wildcard match", "api-eu.example.com", "api-*.example.com", true},
		{"embedded wildcard no match", "api-eu.evil.com", "api-*.example.com", false},
		{"uppercase pattern is lowered before matching", "api-eu.example.com", "API-*.EXAMPLE.COM", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchDomainPattern(tt.hostname, tt.pattern)
			if got != tt.want {
				t.Errorf("matchDomainPattern(%s, %s) = %v, want %v", tt.hostname, tt.pattern, got, tt.want)
			}
		})
	}
}
