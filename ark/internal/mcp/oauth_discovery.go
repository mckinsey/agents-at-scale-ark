/* Copyright 2025. McKinsey & Company */

// Package mcp — thin adapters over github.com/modelcontextprotocol/go-sdk/oauthex
// for the controller's authorization-discovery path (RFC 9728 + RFC 8414
// as invoked by the MCP 2025-06-18 authorization specification).
//
// Discovery itself lives in `oauthex`; this file only re-exports its
// types under shorter aliases, plus two helpers the controller uses
// (parse WWW-Authenticate → metadata URL; issue HTTP client with the
// MCPServer's configured timeout).
package mcp

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

// ProtectedResourceMetadata is the RFC 9728 document shape.
type ProtectedResourceMetadata = oauthex.ProtectedResourceMetadata

// AuthorizationServerMetadata is the RFC 8414 document shape.
type AuthorizationServerMetadata = oauthex.AuthServerMeta

// ParseResourceMetadataURL extracts the `resource_metadata` parameter
// from a `WWW-Authenticate: Bearer ...` header (RFC 9728 §5.1). Returns
// ok=false when no Bearer challenge in the header carries that param.
func ParseResourceMetadataURL(header string) (resourceMetadataURL string, ok bool) {
	if header == "" {
		return "", false
	}
	challenges, err := oauthex.ParseWWWAuthenticate([]string{header})
	if err != nil {
		return "", false
	}
	for _, c := range challenges {
		if c.Scheme != "bearer" {
			continue
		}
		if u := c.Params["resource_metadata"]; u != "" {
			return u, true
		}
	}
	return "", false
}

// FetchProtectedResourceMetadata delegates to oauthex, wiring a client
// bounded by the caller's `timeout` (typically the MCPServer
// `spec.timeout`). Validation of the `resource` field against
// resourceURL is performed by oauthex per RFC 9728 §3.3.
func FetchProtectedResourceMetadata(ctx context.Context, metadataURL, resourceURL string, timeout time.Duration) (*ProtectedResourceMetadata, error) {
	prm, err := oauthex.GetProtectedResourceMetadata(ctx, metadataURL, resourceURL, discoveryClient(timeout))
	if err != nil {
		return nil, fmt.Errorf("fetch protected resource metadata %s: %w", metadataURL, err)
	}
	return prm, nil
}

// FetchAuthorizationServerMetadata delegates to oauthex, which derives
// the RFC 8414 well-known URL for the issuer and validates the
// response.
func FetchAuthorizationServerMetadata(ctx context.Context, issuer string, timeout time.Duration) (*AuthorizationServerMetadata, error) {
	metadataURL := buildAuthServerMetadataURL(issuer)
	asm, err := oauthex.GetAuthServerMeta(ctx, metadataURL, issuer, discoveryClient(timeout))
	if err != nil {
		return nil, fmt.Errorf("fetch authorization server metadata %s: %w", metadataURL, err)
	}
	return asm, nil
}

// buildAuthServerMetadataURL constructs the RFC 8414 §3 well-known URL
// for an issuer by inserting /.well-known/oauth-authorization-server
// between the authority and any existing path component.
func buildAuthServerMetadataURL(issuer string) string {
	base := issuer
	for len(base) > 0 && base[len(base)-1] == '/' {
		base = base[:len(base)-1]
	}
	return base + "/.well-known/oauth-authorization-server"
}

// discoveryClient returns an http.Client bounded by the caller's
// timeout. Indirection is via a var so tests can swap it out.
var discoveryClient = func(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout}
}
