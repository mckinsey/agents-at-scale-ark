/* Copyright 2025. McKinsey & Company */

// Package mcp — OAuth discovery helpers for MCP servers that require
// authorization, per RFC 9728 (Protected Resource Metadata) and
// RFC 8414 (Authorization Server Metadata), as invoked by the MCP
// 2025-06-18 authorization specification.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ProtectedResourceMetadata mirrors the subset of RFC 9728 Protected
// Resource Metadata fields consumed by the Ark controller.
type ProtectedResourceMetadata struct {
	Resource               string   `json:"resource"`
	ResourceName           string   `json:"resource_name,omitempty"`
	AuthorizationServers   []string `json:"authorization_servers,omitempty"`
	BearerMethodsSupported []string `json:"bearer_methods_supported,omitempty"`
	ScopesSupported        []string `json:"scopes_supported,omitempty"`
}

// AuthorizationServerMetadata mirrors the subset of RFC 8414
// Authorization Server Metadata fields consumed by the Ark controller.
type AuthorizationServerMetadata struct {
	Issuer                string   `json:"issuer"`
	AuthorizationEndpoint string   `json:"authorization_endpoint,omitempty"`
	TokenEndpoint         string   `json:"token_endpoint,omitempty"`
	RegistrationEndpoint  string   `json:"registration_endpoint,omitempty"`
	ScopesSupported       []string `json:"scopes_supported,omitempty"`
	GrantTypesSupported   []string `json:"grant_types_supported,omitempty"`
	CodeChallengeMethods  []string `json:"code_challenge_methods_supported,omitempty"`
}

// ParseWWWAuthenticate extracts the `resource_metadata` URL from a
// `WWW-Authenticate: Bearer ...` header as specified in RFC 9728 §5.1.
// Returns ok=false when the header is missing, not a Bearer challenge,
// or does not include a resource_metadata parameter.
func ParseWWWAuthenticate(header string) (resourceMetadataURL string, ok bool) {
	header = strings.TrimSpace(header)
	if header == "" {
		return "", false
	}
	// Challenge format: Bearer param1="v1", param2="v2", ...
	// Case-insensitive scheme.
	if !strings.HasPrefix(strings.ToLower(header), "bearer") {
		return "", false
	}
	params := strings.TrimSpace(header[len("bearer"):])
	for _, part := range splitAuthParams(params) {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(kv[0]))
		val := strings.TrimSpace(kv[1])
		val = strings.Trim(val, `"`)
		if key == "resource_metadata" {
			return val, val != ""
		}
	}
	return "", false
}

// splitAuthParams splits the parameter portion of an auth challenge on
// commas that are not inside quoted strings.
func splitAuthParams(s string) []string {
	var out []string
	var buf strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			inQuote = !inQuote
			buf.WriteByte(c)
		case ',':
			if inQuote {
				buf.WriteByte(c)
			} else {
				out = append(out, strings.TrimSpace(buf.String()))
				buf.Reset()
			}
		default:
			buf.WriteByte(c)
		}
	}
	if buf.Len() > 0 {
		out = append(out, strings.TrimSpace(buf.String()))
	}
	return out
}

// FetchProtectedResourceMetadata GETs the RFC 9728 metadata document at
// the given URL and returns the decoded subset the controller uses.
func FetchProtectedResourceMetadata(ctx context.Context, metadataURL string) (*ProtectedResourceMetadata, error) {
	body, err := fetchJSON(ctx, metadataURL)
	if err != nil {
		return nil, fmt.Errorf("fetch protected resource metadata %s: %w", metadataURL, err)
	}
	var meta ProtectedResourceMetadata
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, fmt.Errorf("decode protected resource metadata %s: %w", metadataURL, err)
	}
	return &meta, nil
}

// FetchAuthorizationServerMetadata GETs the RFC 8414 metadata document
// for the given issuer. Prefers the issuer-prefixed form recommended by
// RFC 8414 (`<issuer>/.well-known/oauth-authorization-server`).
func FetchAuthorizationServerMetadata(ctx context.Context, issuer string) (*AuthorizationServerMetadata, error) {
	metadataURL, err := buildAuthServerMetadataURL(issuer)
	if err != nil {
		return nil, err
	}
	body, err := fetchJSON(ctx, metadataURL)
	if err != nil {
		return nil, fmt.Errorf("fetch authorization server metadata %s: %w", metadataURL, err)
	}
	var meta AuthorizationServerMetadata
	if err := json.Unmarshal(body, &meta); err != nil {
		return nil, fmt.Errorf("decode authorization server metadata %s: %w", metadataURL, err)
	}
	return &meta, nil
}

func buildAuthServerMetadataURL(issuer string) (string, error) {
	u, err := url.Parse(issuer)
	if err != nil {
		return "", fmt.Errorf("parse issuer %s: %w", issuer, err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", fmt.Errorf("issuer %s must be http(s)", issuer)
	}
	// RFC 8414 §3: well-known URI is derived by inserting
	// /.well-known/oauth-authorization-server between the authority and
	// any existing path.
	path := strings.TrimSuffix(u.Path, "/")
	u.Path = "/.well-known/oauth-authorization-server" + path
	return u.String(), nil
}

func fetchJSON(ctx context.Context, endpoint string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected HTTP %d from %s", resp.StatusCode, endpoint)
	}
	return io.ReadAll(resp.Body)
}
