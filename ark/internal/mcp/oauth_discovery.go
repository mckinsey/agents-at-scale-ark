/* Copyright 2025. McKinsey & Company */

// Package mcp — OAuth discovery helpers for MCP servers that require
// authorization, per RFC 9728 (Protected Resource Metadata) and
// RFC 8414 (Authorization Server Metadata), as invoked by the MCP
// 2025-06-18 authorization specification.
//
// The RFC 9728 wire type is re-exported from
// github.com/modelcontextprotocol/go-sdk/oauthex — the go-sdk keeps its
// parsers and fetchers behind the `mcp_go_client_oauth` build tag, but
// the `ProtectedResourceMetadata` struct itself is publicly available,
// so we reuse it and implement the small amount of HTTP + header
// parsing the controller needs.
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

// ProtectedResourceMetadata is the RFC 9728 document shape. We re-export
// the go-sdk type so downstream code depends on a single definition.
type ProtectedResourceMetadata = oauthex.ProtectedResourceMetadata

// AuthorizationServerMetadata is the subset of RFC 8414 fields the
// controller surfaces on `status.authorization`. The upstream go-sdk
// struct is behind a build tag, so we define our own here.
type AuthorizationServerMetadata struct {
	Issuer                        string   `json:"issuer"`
	AuthorizationEndpoint         string   `json:"authorization_endpoint,omitempty"`
	TokenEndpoint                 string   `json:"token_endpoint,omitempty"`
	RegistrationEndpoint          string   `json:"registration_endpoint,omitempty"`
	ScopesSupported               []string `json:"scopes_supported,omitempty"`
	GrantTypesSupported           []string `json:"grant_types_supported,omitempty"`
	CodeChallengeMethodsSupported []string `json:"code_challenge_methods_supported,omitempty"`
}

const (
	// RFC 8414 §3 — well-known URI for authorization server metadata.
	authorizationServerWellKnown = "/.well-known/oauth-authorization-server"

	// discoveryTimeout caps individual metadata fetches so a slow or
	// unreachable authorization server cannot block reconciliation.
	discoveryTimeout = 10 * time.Second
)

// newDiscoveryClient returns the http.Client used for metadata fetches.
// Tests replace its Transport to route requests to httptest servers.
var newDiscoveryClient = func() *http.Client {
	return &http.Client{Timeout: discoveryTimeout}
}

// ParseResourceMetadataURL extracts the `resource_metadata` parameter
// from a `WWW-Authenticate: Bearer ...` header as specified in
// RFC 9728 §5.1. Returns ok=false when the header is missing, is not a
// Bearer challenge, or does not include a resource_metadata parameter.
func ParseResourceMetadataURL(header string) (resourceMetadataURL string, ok bool) {
	header = strings.TrimSpace(header)
	if header == "" {
		return "", false
	}
	if !strings.EqualFold(leadingWord(header), "bearer") {
		return "", false
	}
	params := strings.TrimSpace(header[len("bearer"):])
	for _, part := range splitOnUnquotedComma(params) {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(kv[0]))
		val := strings.Trim(strings.TrimSpace(kv[1]), `"`)
		if key == "resource_metadata" && val != "" {
			return val, true
		}
	}
	return "", false
}

// leadingWord returns the first whitespace-delimited token of s.
func leadingWord(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' {
			return s[:i]
		}
	}
	return s
}

// splitOnUnquotedComma splits s on commas that are not inside a quoted
// string, so `realm="OAuth, really"` is not split on the inner comma.
func splitOnUnquotedComma(s string) []string {
	var out []string
	var buf strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		switch c := s[i]; {
		case c == '"':
			inQuote = !inQuote
			buf.WriteByte(c)
		case c == ',' && !inQuote:
			out = append(out, strings.TrimSpace(buf.String()))
			buf.Reset()
		default:
			buf.WriteByte(c)
		}
	}
	if buf.Len() > 0 {
		out = append(out, strings.TrimSpace(buf.String()))
	}
	return out
}

// FetchProtectedResourceMetadata GETs the RFC 9728 document at
// metadataURL and validates that its `resource` field matches
// resourceURL (RFC 9728 §3.3).
func FetchProtectedResourceMetadata(ctx context.Context, metadataURL, resourceURL string) (*ProtectedResourceMetadata, error) {
	var prm ProtectedResourceMetadata
	if err := fetchJSON(ctx, metadataURL, &prm); err != nil {
		return nil, fmt.Errorf("fetch protected resource metadata %s: %w", metadataURL, err)
	}
	if prm.Resource != resourceURL {
		return nil, fmt.Errorf("protected resource metadata at %s advertises resource=%q, expected %q", metadataURL, prm.Resource, resourceURL)
	}
	return &prm, nil
}

// FetchAuthorizationServerMetadata GETs the RFC 8414 metadata document
// for the given issuer, deriving the well-known URL per RFC 8414 §3.
func FetchAuthorizationServerMetadata(ctx context.Context, issuer string) (*AuthorizationServerMetadata, error) {
	metadataURL, err := buildAuthServerMetadataURL(issuer)
	if err != nil {
		return nil, err
	}
	var asm AuthorizationServerMetadata
	if err := fetchJSON(ctx, metadataURL, &asm); err != nil {
		return nil, fmt.Errorf("fetch authorization server metadata %s: %w", metadataURL, err)
	}
	return &asm, nil
}

// buildAuthServerMetadataURL derives the RFC 8414 well-known metadata
// URL for an issuer. Per RFC 8414 §3 the well-known path is inserted
// between the authority and any existing path component.
func buildAuthServerMetadataURL(issuer string) (string, error) {
	u, err := url.Parse(issuer)
	if err != nil {
		return "", fmt.Errorf("parse issuer %s: %w", issuer, err)
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", fmt.Errorf("issuer %s must be http(s)", issuer)
	}
	u.Path = path.Join(authorizationServerWellKnown, u.Path)
	return u.String(), nil
}

func fetchJSON(ctx context.Context, endpoint string, v any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := newDiscoveryClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}
