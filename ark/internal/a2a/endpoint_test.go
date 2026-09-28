/* Copyright 2025. McKinsey & Company */

package a2a

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/server"

	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestCardTransportURL(t *testing.T) {
	tests := []struct {
		name        string
		card        *A2AAgentCard
		expectedURL string
		expectError bool
	}{
		{
			name:        "no preferred transport assumes json-rpc",
			card:        &A2AAgentCard{URL: "http://agent:8000/a2a"},
			expectedURL: "http://agent:8000/a2a",
		},
		{
			name:        "explicit json-rpc",
			card:        &A2AAgentCard{URL: "http://agent:8000/a2a", PreferredTransport: stringPtr("JSONRPC")},
			expectedURL: "http://agent:8000/a2a",
		},
		{
			name:        "hyphenated json-rpc spelling is accepted",
			card:        &A2AAgentCard{URL: "http://agent:8000/a2a", PreferredTransport: stringPtr("json-rpc")},
			expectedURL: "http://agent:8000/a2a",
		},
		{
			name: "grpc preferred falls back to json-rpc interface",
			card: &A2AAgentCard{
				URL:                "http://agent:8000/a2a/grpc",
				PreferredTransport: stringPtr("GRPC"),
				AdditionalInterfaces: []server.AgentInterface{
					{URL: "http://agent:8000/a2a/grpc", Transport: "GRPC"},
					{URL: "http://agent:8000/a2a/jsonrpc", Transport: "JSONRPC"},
				},
			},
			expectedURL: "http://agent:8000/a2a/jsonrpc",
		},
		{
			name: "grpc only is an error",
			card: &A2AAgentCard{
				URL:                "http://agent:8000/a2a/grpc",
				PreferredTransport: stringPtr("GRPC"),
			},
			expectError: true,
		},
		{
			name: "http+json only is an error",
			card: &A2AAgentCard{
				URL:                  "http://agent:8000/a2a/json",
				PreferredTransport:   stringPtr("HTTP+JSON"),
				AdditionalInterfaces: []server.AgentInterface{{URL: "http://agent:8000/a2a/grpc", Transport: "GRPC"}},
			},
			expectError: true,
		},
		{
			name:        "nil card is an error",
			card:        nil,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, err := CardTransportURL(tt.card)
			if tt.expectError {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.expectedURL, url)
		})
	}
}

func TestCardTransportURLErrorNamesDeclaredTransports(t *testing.T) {
	card := &A2AAgentCard{
		URL:                  "http://agent:8000/a2a/grpc",
		PreferredTransport:   stringPtr("GRPC"),
		AdditionalInterfaces: []server.AgentInterface{{URL: "http://agent:8000/a2a/json", Transport: "HTTP+JSON"}},
	}

	_, err := CardTransportURL(card)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "GRPC")
	assert.Contains(t, err.Error(), "HTTP+JSON")
}

func TestUsesCardEndpoint(t *testing.T) {
	assert.False(t, UsesCardEndpoint(""))
	assert.False(t, UsesCardEndpoint(EndpointResolutionAddress))
	assert.True(t, UsesCardEndpoint(EndpointResolutionCardPath))
	assert.True(t, UsesCardEndpoint(EndpointResolutionCardURL))
}

func TestResolveUnsupportedTransport(t *testing.T) {
	resolved := ResolveUnsupportedTransport("http://weather:8000/", errors.New("agent card declares no JSONRPC interface, only GRPC"))

	assert.Equal(t, "http://weather:8000", resolved.URL)
	assert.Equal(t, ReasonUnsupportedTransport, resolved.Reason)
	assert.Empty(t, resolved.Rejected)
	assert.Contains(t, resolved.Message, "GRPC")
	assert.Contains(t, resolved.Message, "spec.address")
}

func TestResolveEndpoint(t *testing.T) {
	const address = "http://weather.default.svc.cluster.local:8000"
	const secureAddress = "https://weather.default.svc.cluster.local"

	tests := []struct {
		name         string
		address      string
		cardURL      string
		mode         string
		allowedHosts []string
		expectedURL  string
		expectedRej  string
		expectedRsn  string
	}{
		{
			name:        "default mode ignores the card",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        "",
			expectedURL: address,
		},
		{
			name:        "address mode ignores the card",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionAddress,
			expectedURL: address,
		},
		{
			name:        "address mode trims a trailing slash",
			address:     address + "/",
			cardURL:     "",
			mode:        EndpointResolutionAddress,
			expectedURL: address,
		},
		{
			name:        "card path keeps the configured host",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/v1",
		},
		{
			name:        "card path replaces an existing address path",
			address:     address + "/old",
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/v1",
		},
		{
			name:        "card path drops a trailing slash",
			address:     address,
			cardURL:     "http://localhost:8000/a2a/agent/weather/",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/agent/weather",
		},
		{
			name:        "card path ignores query and fragment",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/v1?token=abc#frag",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/v1",
		},
		{
			name:        "card path normalizes dot segments and repeated slashes",
			address:     address,
			cardURL:     "https://weather.example.com/a//b/./c/",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a/b/c",
		},
		{
			name:        "card path keeps percent encoding",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/my%20agent",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/my%20agent",
		},
		{
			name:        "card path with a rootless card falls back to the address",
			address:     address,
			cardURL:     "https://weather.example.com/",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
		},
		{
			name:        "card path rejects a path that escapes the root",
			address:     address,
			cardURL:     "https://weather.example.com/../../admin",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
			expectedRej: "https://weather.example.com/../../admin",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "card path rejects a relative card url",
			address:     address,
			cardURL:     "/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
			expectedRej: "/a2a/v1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "card path rejects a card url with userinfo",
			address:     address,
			cardURL:     "https://user:secret@weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
			expectedRej: "https://user:secret@weather.example.com/a2a/v1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "card path rejects a non http scheme",
			address:     address,
			cardURL:     "grpc://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
			expectedRej: "grpc://weather.example.com/a2a/v1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "empty card url is reported",
			address:     address,
			cardURL:     "",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
			expectedRsn: ReasonNoAgentCardURL,
		},
		{
			name:        "card url on the same origin is accepted",
			address:     address,
			cardURL:     "http://weather.default.svc.cluster.local:8000/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: "http://weather.default.svc.cluster.local:8000/a2a/v1",
		},
		{
			name:        "card url with the implicit default port matches an explicit one",
			address:     secureAddress + ":443",
			cardURL:     "https://weather.default.svc.cluster.local/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: "https://weather.default.svc.cluster.local/a2a/v1",
		},
		{
			name:        "card url with a different port on the same host is rejected",
			address:     address,
			cardURL:     "http://weather.default.svc.cluster.local:9000/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "http://weather.default.svc.cluster.local:9000/a2a/v1",
			expectedRsn: ReasonCrossOriginNotAllow,
		},
		{
			name:        "card url with a different scheme on the same host is rejected",
			address:     address,
			cardURL:     "https://weather.default.svc.cluster.local:8000/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "https://weather.default.svc.cluster.local:8000/a2a/v1",
			expectedRsn: ReasonCrossOriginNotAllow,
		},
		{
			name:        "card url downgrading https to http is rejected",
			address:     secureAddress,
			cardURL:     "http://weather.default.svc.cluster.local/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: secureAddress,
			expectedRej: "http://weather.default.svc.cluster.local/a2a/v1",
			expectedRsn: ReasonCrossOriginNotAllow,
		},
		{
			name:         "allowlisted host cannot downgrade https to http",
			address:      secureAddress,
			cardURL:      "http://weather.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com"},
			expectedURL:  secureAddress,
			expectedRej:  "http://weather.example.com/a2a/v1",
			expectedRsn:  ReasonSchemeDowngrade,
		},
		{
			name:         "allowlisted host may upgrade http to https",
			address:      address,
			cardURL:      "https://weather.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com"},
			expectedURL:  "https://weather.example.com/a2a/v1",
		},
		{
			name:        "card url on another host is rejected without an allowlist",
			address:     address,
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "https://weather.example.com/a2a/v1",
			expectedRsn: ReasonCrossOriginNotAllow,
		},
		{
			name:         "blank allowlist entries are skipped",
			address:      address,
			cardURL:      "https://weather.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"", "   ", "weather.example.com"},
			expectedURL:  "https://weather.example.com/a2a/v1",
		},
		{
			name:         "allowlist entry without a port matches any port",
			address:      address,
			cardURL:      "https://weather.example.com:8443/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com"},
			expectedURL:  "https://weather.example.com:8443/a2a/v1",
		},
		{
			name:         "allowlist entry with a port matches that port",
			address:      address,
			cardURL:      "https://weather.example.com:8443/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com:8443"},
			expectedURL:  "https://weather.example.com:8443/a2a/v1",
		},
		{
			name:         "allowlist entry with a port matches the implicit default port",
			address:      address,
			cardURL:      "https://weather.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com:443"},
			expectedURL:  "https://weather.example.com/a2a/v1",
		},
		{
			name:         "allowlist entry with a port rejects another port",
			address:      address,
			cardURL:      "https://weather.example.com:9443/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com:8443"},
			expectedURL:  address,
			expectedRej:  "https://weather.example.com:9443/a2a/v1",
			expectedRsn:  ReasonCrossOriginNotAllow,
		},
		{
			name:         "allowlist matching is case insensitive",
			address:      address,
			cardURL:      "https://Weather.Example.COM/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com"},
			expectedURL:  "https://Weather.Example.COM/a2a/v1",
		},
		{
			name:         "wildcard matches one level of subdomain",
			address:      address,
			cardURL:      "https://weather.agents.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"*.agents.example.com"},
			expectedURL:  "https://weather.agents.example.com/a2a/v1",
		},
		{
			name:         "wildcard with a port matches that port",
			address:      address,
			cardURL:      "https://weather.agents.example.com:8443/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"*.agents.example.com:8443"},
			expectedURL:  "https://weather.agents.example.com:8443/a2a/v1",
		},
		{
			name:         "wildcard does not match deeper subdomains",
			address:      address,
			cardURL:      "https://eu.weather.agents.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"*.agents.example.com"},
			expectedURL:  address,
			expectedRej:  "https://eu.weather.agents.example.com/a2a/v1",
			expectedRsn:  ReasonCrossOriginNotAllow,
		},
		{
			name:         "wildcard does not match the bare domain",
			address:      address,
			cardURL:      "https://agents.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"*.agents.example.com"},
			expectedURL:  address,
			expectedRej:  "https://agents.example.com/a2a/v1",
			expectedRsn:  ReasonCrossOriginNotAllow,
		},
		{
			name:        "card url with userinfo on the same origin is rejected",
			address:     address,
			cardURL:     "http://attacker:tok@weather.default.svc.cluster.local:8000/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "http://attacker:tok@weather.default.svc.cluster.local:8000/a2a/v1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "card url strips query and fragment",
			address:     address,
			cardURL:     "http://weather.default.svc.cluster.local:8000/a2a/v1/?x=1#f",
			mode:        EndpointResolutionCardURL,
			expectedURL: "http://weather.default.svc.cluster.local:8000/a2a/v1",
		},
		{
			name:        "relative card url is rejected in cardUrl mode",
			address:     address,
			cardURL:     "/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "/a2a/v1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "non http scheme is rejected",
			address:     address,
			cardURL:     "file:///etc/passwd",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "file:///etc/passwd",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "opaque url is rejected",
			address:     address,
			cardURL:     "mailto:agent@example.com",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "mailto:agent@example.com",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "unparsable card url is rejected",
			address:     address,
			cardURL:     "http://[::1",
			mode:        EndpointResolutionCardURL,
			expectedURL: address,
			expectedRej: "http://[::1",
			expectedRsn: ReasonInvalidAgentCardURL,
		},
		{
			name:        "address without a host cannot be overridden",
			address:     "weather.default.svc.cluster.local:8000",
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: "weather.default.svc.cluster.local:8000",
			expectedRej: "https://weather.example.com/a2a/v1",
			expectedRsn: ReasonInvalidAddress,
		},
		{
			name:        "address with a non http scheme cannot be overridden",
			address:     "grpc://weather.default.svc.cluster.local:8000",
			cardURL:     "https://weather.example.com/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: "grpc://weather.default.svc.cluster.local:8000",
			expectedRej: "https://weather.example.com/a2a/v1",
			expectedRsn: ReasonInvalidAddress,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved := ResolveEndpoint(tt.address, tt.cardURL, tt.mode, tt.allowedHosts)

			assert.Equal(t, tt.expectedURL, resolved.URL)
			assert.Equal(t, tt.expectedRej, resolved.Rejected)
			assert.Equal(t, tt.expectedRsn, resolved.Reason)
			assert.NotEmpty(t, resolved.Message)
			assert.NotContains(t, resolved.URL, "@")
		})
	}
}

func TestValidateAllowedEndpointHost(t *testing.T) {
	valid := []string{
		"agents.example.com",
		"localhost",
		"a.b.c",
		"*.agents.example.com",
		"agents.example.com:8443",
		"*.agents.example.com:443",
		"weather-svc.default.svc.cluster.local",
	}
	for _, entry := range valid {
		t.Run("valid "+entry, func(t *testing.T) {
			assert.NoError(t, ValidateAllowedEndpointHost(entry))
		})
	}

	invalid := []string{
		"",
		"   ",
		"*",
		"*.",
		"*.example.com.",
		".example.com",
		"agents..example.com",
		"-agents.example.com",
		"https://agents.example.com",
		"agents.example.com/rpc",
		"user@agents.example.com",
		"agents.example.com:0",
		"agents.example.com:70000",
		"agents.example.com:abc",
		"agents.example.com:",
		"agents.example.com:8443:1",
	}
	for _, entry := range invalid {
		t.Run("invalid "+entry, func(t *testing.T) {
			assert.Error(t, ValidateAllowedEndpointHost(entry))
		})
	}
}

func TestRPCEndpoint(t *testing.T) {
	tests := []struct {
		name     string
		status   arkv1prealpha1.A2AServerStatus
		expected string
	}{
		{
			name:     "prefers the resolved endpoint",
			status:   arkv1prealpha1.A2AServerStatus{LastResolvedAddress: "http://a", LastResolvedEndpoint: "http://a/a2a"},
			expected: "http://a/a2a",
		},
		{
			name:     "falls back to the resolved address",
			status:   arkv1prealpha1.A2AServerStatus{LastResolvedAddress: "http://a"},
			expected: "http://a",
		},
		{
			name:     "empty status yields an empty endpoint",
			status:   arkv1prealpha1.A2AServerStatus{},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, RPCEndpoint(&arkv1prealpha1.A2AServer{Status: tt.status}))
		})
	}
}
