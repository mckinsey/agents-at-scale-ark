/* Copyright 2025. McKinsey & Company */

// Package mcp — OAuth 2.0 client credentials (RFC 6749 §4.4) with
// private_key_jwt client authentication (RFC 7523 §2.2), as profiled by
// the MCP OAuth Client Credentials Extension.
//
// These are pure functions over an authorization server's RFC 8414
// metadata: no Kubernetes types, no I/O beyond the token request itself.
package mcp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// GrantTypeClientCredentials is the RFC 6749 §4.4 grant type.
	GrantTypeClientCredentials = "client_credentials"

	// AuthMethodPrivateKeyJWT is the RFC 7523 §2.2 client authentication
	// method name as it appears in RFC 8414 metadata.
	AuthMethodPrivateKeyJWT = "private_key_jwt"

	// ClientAssertionTypeJWTBearer is the fixed RFC 7523 §2.2 value for
	// the `client_assertion_type` token request parameter.
	ClientAssertionTypeJWTBearer = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"

	// assertionTTL bounds the lifetime of a client assertion. The
	// assertion is consumed immediately by the token endpoint, so this
	// only needs to absorb clock skew between Ark and the authorization
	// server.
	assertionTTL = 60 * time.Second
)

// ASCapabilities is the subset of RFC 8414 authorization server metadata
// the client-credentials path depends on.
type ASCapabilities struct {
	GrantTypesSupported                        []string
	TokenEndpointAuthMethodsSupported          []string
	TokenEndpointAuthSigningAlgValuesSupported []string
}

// ErrCapabilityUnsupported is returned by ValidateASCapabilities when
// the authorization server does not advertise something the flow needs.
// Callers surface this as TokenAcquisitionFailed rather than attempting
// a token request that cannot succeed.
var ErrCapabilityUnsupported = errors.New("authorization server capability not advertised")

// ValidateASCapabilities enforces step 2 of the token lifecycle: refuse
// to mint against an authorization server that has not advertised
// client_credentials, private_key_jwt, and the configured signing
// algorithm.
//
// A metadata field that is absent entirely is treated as unsupported.
// RFC 8414 marks these fields RECOMMENDED rather than REQUIRED, but the
// MCP Client Credentials Extension requires them to be validated, and
// guessing that an omitted field means "supported" would send a signed
// assertion to a server that never claimed to accept one.
func ValidateASCapabilities(caps ASCapabilities, algorithm string) error {
	if !containsFold(caps.GrantTypesSupported, GrantTypeClientCredentials) {
		return fmt.Errorf("%w: grant_types_supported lacks %q (advertised: %v)",
			ErrCapabilityUnsupported, GrantTypeClientCredentials, caps.GrantTypesSupported)
	}
	if !containsFold(caps.TokenEndpointAuthMethodsSupported, AuthMethodPrivateKeyJWT) {
		return fmt.Errorf("%w: token_endpoint_auth_methods_supported lacks %q (advertised: %v)",
			ErrCapabilityUnsupported, AuthMethodPrivateKeyJWT, caps.TokenEndpointAuthMethodsSupported)
	}
	if !containsFold(caps.TokenEndpointAuthSigningAlgValuesSupported, algorithm) {
		return fmt.Errorf("%w: token_endpoint_auth_signing_alg_values_supported lacks %q (advertised: %v)",
			ErrCapabilityUnsupported, algorithm, caps.TokenEndpointAuthSigningAlgValuesSupported)
	}
	return nil
}

func containsFold(haystack []string, needle string) bool {
	for _, v := range haystack {
		if strings.EqualFold(v, needle) {
			return true
		}
	}
	return false
}

// AssertionParams describes the RFC 7523 client assertion to be signed.
type AssertionParams struct {
	ClientID      string
	TokenEndpoint string
	Algorithm     string
	KeyID         string
	PrivateKeyPEM []byte
}

// BuildAssertion signs a client authentication assertion.
//
// `iss` and `sub` are both the client ID (RFC 7523 §3), `aud` is the
// token endpoint, and `jti` is unique per assertion so the authorization
// server can reject replays within the short `exp` window.
func BuildAssertion(p AssertionParams) (string, error) {
	method := jwt.GetSigningMethod(p.Algorithm)
	if method == nil {
		return "", fmt.Errorf("unsupported signing algorithm %q", p.Algorithm)
	}

	key, err := parsePrivateKey(p.Algorithm, p.PrivateKeyPEM)
	if err != nil {
		return "", err
	}

	jti, err := newJTI()
	if err != nil {
		return "", err
	}

	now := time.Now()
	token := jwt.NewWithClaims(method, jwt.MapClaims{
		"iss": p.ClientID,
		"sub": p.ClientID,
		"aud": p.TokenEndpoint,
		"jti": jti,
		"iat": now.Unix(),
		"exp": now.Add(assertionTTL).Unix(),
	})
	if p.KeyID != "" {
		token.Header["kid"] = p.KeyID
	}

	signed, err := token.SignedString(key)
	if err != nil {
		return "", fmt.Errorf("signing client assertion: %w", err)
	}
	return signed, nil
}

func parsePrivateKey(algorithm string, pemBytes []byte) (any, error) {
	if len(pemBytes) == 0 {
		return nil, errors.New("signing key is empty")
	}
	switch {
	case strings.HasPrefix(algorithm, "ES"):
		key, err := jwt.ParseECPrivateKeyFromPEM(pemBytes)
		if err != nil {
			return nil, fmt.Errorf("parsing EC private key: %w", err)
		}
		return key, nil
	case strings.HasPrefix(algorithm, "RS"), strings.HasPrefix(algorithm, "PS"):
		key, err := jwt.ParseRSAPrivateKeyFromPEM(pemBytes)
		if err != nil {
			return nil, fmt.Errorf("parsing RSA private key: %w", err)
		}
		return key, nil
	default:
		return nil, fmt.Errorf("unsupported signing algorithm %q", algorithm)
	}
}

func newJTI() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generating assertion jti: %w", err)
	}
	return hex.EncodeToString(buf), nil
}

// TokenResponse is the successful RFC 6749 §5.1 token endpoint payload.
type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int64  `json:"expires_in"`
	Scope       string `json:"scope"`
}

// TokenRequestParams describes a client_credentials token request.
type TokenRequestParams struct {
	TokenEndpoint string
	Assertion     string
	Resource      string
	Scopes        []string
	Timeout       time.Duration
}

// TokenError is a structured RFC 6749 §5.2 error response. The
// authorization server's `error` code is retained so callers can
// distinguish a misconfiguration (invalid_client, invalid_scope) from a
// transient failure.
type TokenError struct {
	StatusCode  int
	Code        string
	Description string
}

func (e *TokenError) Error() string {
	if e.Description != "" {
		return fmt.Sprintf("token endpoint returned HTTP %d: %s: %s", e.StatusCode, e.Code, e.Description)
	}
	if e.Code != "" {
		return fmt.Sprintf("token endpoint returned HTTP %d: %s", e.StatusCode, e.Code)
	}
	return fmt.Sprintf("token endpoint returned HTTP %d", e.StatusCode)
}

// RequestToken exchanges a signed client assertion for an access token.
//
// The response body is never logged or wrapped into the returned error
// on success paths, and TokenError carries only the RFC 6749 error code
// and description — never the token itself.
func RequestToken(ctx context.Context, p TokenRequestParams) (*TokenResponse, error) {
	form := url.Values{}
	form.Set("grant_type", GrantTypeClientCredentials)
	form.Set("client_assertion_type", ClientAssertionTypeJWTBearer)
	form.Set("client_assertion", p.Assertion)
	if p.Resource != "" {
		form.Set("resource", p.Resource)
	}
	if len(p.Scopes) > 0 {
		form.Set("scope", strings.Join(p.Scopes, " "))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenEndpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("building token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request to %s failed: %w", p.TokenEndpoint, err)
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("reading token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, newTokenError(resp.StatusCode, body)
	}

	var tr TokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("token response is not valid JSON: %w", err)
	}
	if tr.AccessToken == "" {
		return nil, errors.New("token response has no access_token")
	}
	return &tr, nil
}

func newTokenError(status int, body []byte) *TokenError {
	te := &TokenError{StatusCode: status}
	var payload struct {
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &payload); err == nil {
		te.Code = payload.Error
		te.Description = payload.Description
	}
	return te
}
