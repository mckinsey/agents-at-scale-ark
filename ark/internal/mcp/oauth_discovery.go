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
	"net/url"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
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

// FetchAuthorizationServerMetadata resolves the issuer's metadata through
// the well-known candidates mandated by the MCP authorization
// specification: RFC 8414 with path insertion, then OpenID Connect
// discovery. An issuer with a path component that only publishes the
// legacy path-appended RFC 8414 document is tried last. Returns nil, nil
// when no candidate is published.
func FetchAuthorizationServerMetadata(ctx context.Context, issuer string, timeout time.Duration) (*AuthorizationServerMetadata, error) {
	client := discoveryClient(timeout)
	asm, err := auth.GetAuthServerMetadata(ctx, issuer, client)
	if err != nil {
		return nil, fmt.Errorf("fetch authorization server metadata for issuer %s: %w", issuer, err)
	}
	if asm != nil || !issuerHasPath(issuer) {
		return asm, nil
	}

	legacyURL := legacyAuthServerMetadataURL(issuer)
	asm, err = oauthex.GetAuthServerMeta(ctx, legacyURL, issuer, client)
	if err != nil {
		return nil, fmt.Errorf("fetch authorization server metadata %s: %w", legacyURL, err)
	}
	return asm, nil
}

func issuerHasPath(issuer string) bool {
	u, err := url.Parse(issuer)
	return err == nil && u.Path != ""
}

// legacyAuthServerMetadataURL appends /.well-known/oauth-authorization-server
// to the issuer. This predates RFC 8414 §3.1 path insertion and is kept
// only as a fallback for servers that still publish it.
func legacyAuthServerMetadataURL(issuer string) string {
	return strings.TrimRight(issuer, "/") + "/.well-known/oauth-authorization-server"
}

var sharedOAuthTransport = &http.Transport{
	MaxIdleConns:        10,
	MaxIdleConnsPerHost: 5,
	IdleConnTimeout:     90 * time.Second,
}

var discoveryClient = func(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, Transport: sharedOAuthTransport}
}
