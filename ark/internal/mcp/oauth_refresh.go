/* Copyright 2025. McKinsey & Company */

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

// TokenRefreshRequest is the subset of RFC 6749 §6 parameters the
// controller sends when refreshing an access token. `resource` (RFC 8707)
// is included per MCP 2025-06-18.
type TokenRefreshRequest struct {
	TokenEndpoint string
	ClientID      string
	ClientSecret  string
	RefreshToken  string
	Resource      string
}

// TokenRefreshResponse is the RFC 6749 §5.1 token response we persist.
// Only the fields we store are unmarshalled; unknown fields are ignored.
type TokenRefreshResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// RefreshToken exchanges a refresh_token for a fresh access_token per
// RFC 6749 §6. Uses HTTP Basic for client authentication — the same
// method the CLI uses at initial token exchange.
//
// The caller supplies the timeout (typically MCPServer spec.timeout).
// On non-2xx, the response body is quoted in the returned error so
// `invalid_grant` / `invalid_client` conditions surface in events and
// status conditions.
func RefreshToken(ctx context.Context, req TokenRefreshRequest, timeout time.Duration) (*TokenRefreshResponse, error) {
	if req.TokenEndpoint == "" || req.RefreshToken == "" {
		return nil, fmt.Errorf("token_endpoint and refresh_token are required")
	}

	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", req.RefreshToken)
	if req.Resource != "" {
		form.Set("resource", req.Resource)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, req.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("build refresh request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	httpReq.Header.Set("Accept", "application/json")
	if req.ClientID != "" {
		httpReq.SetBasicAuth(req.ClientID, req.ClientSecret)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("refresh %s: %w", req.TokenEndpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("refresh %s: HTTP %d: %s", req.TokenEndpoint, resp.StatusCode, string(body))
	}

	var out TokenRefreshResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("decode token response: %w", err)
	}
	if out.AccessToken == "" {
		return nil, fmt.Errorf("token response missing access_token (body=%s)", string(body))
	}
	return &out, nil
}
