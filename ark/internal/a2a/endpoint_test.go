/* Copyright 2025. McKinsey & Company */

package a2a

import (
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

func TestResolveEndpoint(t *testing.T) {
	const address = "http://weather.default.svc.cluster.local:8000"

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
			name:        "card path with a rootless card falls back to the address",
			address:     address,
			cardURL:     "https://weather.example.com/",
			mode:        EndpointResolutionCardPath,
			expectedURL: address,
		},
		{
			name:        "card path with a relative card url still yields the path",
			address:     address,
			cardURL:     "/a2a/v1",
			mode:        EndpointResolutionCardPath,
			expectedURL: address + "/a2a/v1",
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
			name:        "card url on the same host is accepted",
			address:     address,
			cardURL:     "http://weather.default.svc.cluster.local:8000/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: "http://weather.default.svc.cluster.local:8000/a2a/v1",
		},
		{
			name:        "card url on the same host but a different port is accepted",
			address:     address,
			cardURL:     "https://weather.default.svc.cluster.local:9443/a2a/v1",
			mode:        EndpointResolutionCardURL,
			expectedURL: "https://weather.default.svc.cluster.local:9443/a2a/v1",
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
			name:         "card url on an allowed host is accepted",
			address:      address,
			cardURL:      "https://weather.example.com/a2a/v1",
			mode:         EndpointResolutionCardURL,
			allowedHosts: []string{"weather.example.com"},
			expectedURL:  "https://weather.example.com/a2a/v1",
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resolved := ResolveEndpoint(tt.address, tt.cardURL, tt.mode, tt.allowedHosts)

			assert.Equal(t, tt.expectedURL, resolved.URL)
			assert.Equal(t, tt.expectedRej, resolved.Rejected)
			assert.Equal(t, tt.expectedRsn, resolved.Reason)
			assert.NotEmpty(t, resolved.Message)
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
