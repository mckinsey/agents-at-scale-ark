/* Copyright 2025. McKinsey & Company */

package mcp

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testClientID = "ark-client"

func newTestKey(t *testing.T) (*ecdsa.PrivateKey, []byte) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}
	der, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatalf("marshalling key: %v", err)
	}
	return key, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der})
}

func fullCapabilities() ASCapabilities {
	return ASCapabilities{
		GrantTypesSupported:                        []string{"authorization_code", "client_credentials"},
		TokenEndpointAuthMethodsSupported:          []string{"client_secret_post", "private_key_jwt"},
		TokenEndpointAuthSigningAlgValuesSupported: []string{"RS256", "ES256"},
	}
}

func TestValidateASCapabilities(t *testing.T) {
	t.Run("accepts a fully advertised server", func(t *testing.T) {
		if err := ValidateASCapabilities(fullCapabilities(), "ES256"); err != nil {
			t.Fatalf("expected success, got %v", err)
		}
	})

	t.Run("matches case-insensitively", func(t *testing.T) {
		caps := fullCapabilities()
		caps.TokenEndpointAuthSigningAlgValuesSupported = []string{"es256"}
		if err := ValidateASCapabilities(caps, "ES256"); err != nil {
			t.Fatalf("expected success, got %v", err)
		}
	})

	// This is the mock-llm shape: authorization_code + refresh_token,
	// client_secret_post, no signing algs. Minting against it must be
	// refused rather than attempted.
	t.Run("rejects the browser-only server shape", func(t *testing.T) {
		caps := ASCapabilities{
			GrantTypesSupported:               []string{"authorization_code", "refresh_token"},
			TokenEndpointAuthMethodsSupported: []string{"client_secret_post"},
		}
		err := ValidateASCapabilities(caps, "ES256")
		if !errors.Is(err, ErrCapabilityUnsupported) {
			t.Fatalf("expected ErrCapabilityUnsupported, got %v", err)
		}
	})

	t.Run("rejects each missing capability individually", func(t *testing.T) {
		cases := map[string]func(*ASCapabilities){
			"no client_credentials": func(c *ASCapabilities) { c.GrantTypesSupported = []string{"authorization_code"} },
			"no private_key_jwt":    func(c *ASCapabilities) { c.TokenEndpointAuthMethodsSupported = []string{"client_secret_basic"} },
			"no signing alg":        func(c *ASCapabilities) { c.TokenEndpointAuthSigningAlgValuesSupported = []string{"RS256"} },
			"absent metadata":       func(c *ASCapabilities) { *c = ASCapabilities{} },
		}
		for name, mutate := range cases {
			t.Run(name, func(t *testing.T) {
				caps := fullCapabilities()
				mutate(&caps)
				if err := ValidateASCapabilities(caps, "ES256"); !errors.Is(err, ErrCapabilityUnsupported) {
					t.Fatalf("expected ErrCapabilityUnsupported, got %v", err)
				}
			})
		}
	})
}

func TestBuildAssertionClaims(t *testing.T) {
	key, keyPEM := newTestKey(t)

	raw, err := BuildAssertion(AssertionParams{
		ClientID:      "ark-client",
		TokenEndpoint: "https://auth.example.com/token",
		Algorithm:     "ES256",
		KeyID:         "key-1",
		PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}

	parsed, err := jwt.Parse(raw, func(*jwt.Token) (any, error) { return &key.PublicKey, nil },
		jwt.WithValidMethods([]string{"ES256"}),
		jwt.WithAudience("https://auth.example.com/token"))
	if err != nil {
		t.Fatalf("assertion did not verify: %v", err)
	}
	if kid := parsed.Header["kid"]; kid != "key-1" {
		t.Errorf("kid = %v, want key-1", kid)
	}

	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("claims are %T, want jwt.MapClaims", parsed.Claims)
	}
	if claims["iss"] != testClientID || claims["sub"] != testClientID {
		t.Errorf("iss/sub = %v/%v, want %s for both", claims["iss"], claims["sub"], testClientID)
	}
	if claims["jti"] == nil || claims["jti"] == "" {
		t.Error("jti must be present")
	}
	exp, err := claims.GetExpirationTime()
	if err != nil || exp == nil {
		t.Fatalf("exp missing: %v", err)
	}
	if d := time.Until(exp.Time); d <= 0 || d > assertionTTL+time.Second {
		t.Errorf("exp is %v away, want (0, %v]", d, assertionTTL)
	}
}

func TestBuildAssertionJTIIsUnique(t *testing.T) {
	_, keyPEM := newTestKey(t)
	p := AssertionParams{ClientID: "c", TokenEndpoint: "https://a/token", Algorithm: "ES256", PrivateKeyPEM: keyPEM}

	seen := map[string]bool{}
	for range 20 {
		raw, err := BuildAssertion(p)
		if err != nil {
			t.Fatalf("BuildAssertion: %v", err)
		}
		claims := jwt.MapClaims{}
		if _, _, err := jwt.NewParser().ParseUnverified(raw, claims); err != nil {
			t.Fatalf("parse: %v", err)
		}
		jti, _ := claims["jti"].(string)
		if seen[jti] {
			t.Fatalf("duplicate jti %q", jti)
		}
		seen[jti] = true
	}
}

func TestBuildAssertionOmitsKID(t *testing.T) {
	_, keyPEM := newTestKey(t)

	raw, err := BuildAssertion(AssertionParams{
		ClientID: "c", TokenEndpoint: "https://a/token", Algorithm: "ES256", PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}
	tok, _, err := jwt.NewParser().ParseUnverified(raw, jwt.MapClaims{})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, ok := tok.Header["kid"]; ok {
		t.Error("kid header should be absent when KeyID is empty")
	}
}

func TestBuildAssertionRejectsBadInputs(t *testing.T) {
	_, keyPEM := newTestKey(t)

	cases := map[string]AssertionParams{
		"unknown algorithm": {ClientID: "c", TokenEndpoint: "https://a", Algorithm: "HS256-nope", PrivateKeyPEM: keyPEM},
		"empty key":         {ClientID: "c", TokenEndpoint: "https://a", Algorithm: "ES256"},
		"malformed PEM":     {ClientID: "c", TokenEndpoint: "https://a", Algorithm: "ES256", PrivateKeyPEM: []byte("not a pem")},
		"RSA alg, EC key":   {ClientID: "c", TokenEndpoint: "https://a", Algorithm: "RS256", PrivateKeyPEM: keyPEM},
	}
	for name, p := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := BuildAssertion(p); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

// tokenServer is a token endpoint that actually verifies the assertion
// signature, audience, and required form parameters — the property an
// unconditionally-accepting fake cannot give us.
func tokenServer(t *testing.T, pub *ecdsa.PublicKey, expiresIn int64) (*httptest.Server, *url.Values) {
	t.Helper()
	captured := &url.Values{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			http.Error(w, `{"error":"invalid_request"}`, http.StatusBadRequest)
			return
		}
		*captured = r.PostForm

		if r.PostForm.Get("grant_type") != GrantTypeClientCredentials ||
			r.PostForm.Get("client_assertion_type") != ClientAssertionTypeJWTBearer {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"unsupported_grant_type"}`))
			return
		}

		if _, err := jwt.Parse(r.PostForm.Get("client_assertion"),
			func(*jwt.Token) (any, error) { return pub, nil },
			jwt.WithValidMethods([]string{"ES256"})); err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"invalid_client","error_description":"assertion did not verify"}`))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"access_token": "minted-token",
			"token_type":   "Bearer",
			"expires_in":   expiresIn,
		})
	}))
	t.Cleanup(srv.Close)
	return srv, captured
}

func TestRequestTokenRoundTrip(t *testing.T) {
	key, keyPEM := newTestKey(t)
	srv, form := tokenServer(t, &key.PublicKey, 3600)

	assertion, err := BuildAssertion(AssertionParams{
		ClientID: "ark-client", TokenEndpoint: srv.URL, Algorithm: "ES256", PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}

	tr, err := RequestToken(context.Background(), TokenRequestParams{
		TokenEndpoint: srv.URL,
		Assertion:     assertion,
		Resource:      "https://mcp.example.com/mcp",
		Scopes:        []string{"mcp:read", "mcp:tools"},
	})
	if err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	if tr.AccessToken != "minted-token" || tr.ExpiresIn != 3600 {
		t.Errorf("got %+v", tr)
	}
	if got := form.Get("resource"); got != "https://mcp.example.com/mcp" {
		t.Errorf("resource = %q", got)
	}
	if got := form.Get("scope"); got != "mcp:read mcp:tools" {
		t.Errorf("scope = %q, want space-delimited", got)
	}
}

// client_id is OPTIONAL under RFC 7521 §4.2 when the assertion identifies
// the client, but Entra and some Keycloak setups require it and answer a
// bare invalid_client when it is absent. Pin that we always send it.
func TestRequestTokenSendsClientID(t *testing.T) {
	key, keyPEM := newTestKey(t)
	srv, form := tokenServer(t, &key.PublicKey, 3600)

	assertion, err := BuildAssertion(AssertionParams{
		ClientID: "ark-client", TokenEndpoint: srv.URL, Algorithm: "ES256", PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}
	if _, err := RequestToken(context.Background(), TokenRequestParams{
		TokenEndpoint: srv.URL, ClientID: "ark-client", Assertion: assertion,
	}); err != nil {
		t.Fatalf("RequestToken: %v", err)
	}

	if got := form.Get("client_id"); got != testClientID {
		t.Errorf("client_id = %q, want %s", got, testClientID)
	}
	// RFC 7521 §4.2: when present it must identify the same client as the
	// assertion's iss/sub.
	claims := jwt.MapClaims{}
	if _, _, err := jwt.NewParser().ParseUnverified(form.Get("client_assertion"), claims); err != nil {
		t.Fatalf("parse assertion: %v", err)
	}
	if claims["iss"] != form.Get("client_id") {
		t.Errorf("client_id %q disagrees with assertion iss %v", form.Get("client_id"), claims["iss"])
	}
}

func TestRequestTokenOmitsUnsetParams(t *testing.T) {
	key, keyPEM := newTestKey(t)
	srv, form := tokenServer(t, &key.PublicKey, 60)

	assertion, err := BuildAssertion(AssertionParams{
		ClientID: "c", TokenEndpoint: srv.URL, Algorithm: "ES256", PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}
	if _, err := RequestToken(context.Background(), TokenRequestParams{
		TokenEndpoint: srv.URL, Assertion: assertion,
	}); err != nil {
		t.Fatalf("RequestToken: %v", err)
	}
	if form.Has("resource") || form.Has("scope") {
		t.Errorf("resource/scope should be absent, got %v", *form)
	}
}

func TestRequestTokenSurfacesOAuthError(t *testing.T) {
	_, keyPEM := newTestKey(t)
	otherKey, _ := newTestKey(t)
	srv, _ := tokenServer(t, &otherKey.PublicKey, 3600)

	assertion, err := BuildAssertion(AssertionParams{
		ClientID: "c", TokenEndpoint: srv.URL, Algorithm: "ES256", PrivateKeyPEM: keyPEM,
	})
	if err != nil {
		t.Fatalf("BuildAssertion: %v", err)
	}
	_, err = RequestToken(context.Background(), TokenRequestParams{
		TokenEndpoint: srv.URL, Assertion: assertion,
	})

	var te *TokenError
	if !errors.As(err, &te) {
		t.Fatalf("expected *TokenError, got %T: %v", err, err)
	}
	if te.StatusCode != http.StatusUnauthorized || te.Code != "invalid_client" {
		t.Errorf("got status=%d code=%q", te.StatusCode, te.Code)
	}
}

func TestRequestTokenRejectsMalformedSuccess(t *testing.T) {
	cases := map[string]string{
		"no access_token": `{"token_type":"Bearer"}`,
		"non-JSON body":   `<html>gateway</html>`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(body))
			}))
			defer srv.Close()

			if _, err := RequestToken(context.Background(), TokenRequestParams{
				TokenEndpoint: srv.URL, Assertion: "x",
			}); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestRequestTokenHonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := RequestToken(ctx, TokenRequestParams{
		TokenEndpoint: "http://127.0.0.1:1/token", Assertion: "x",
	}); err == nil {
		t.Fatal("expected an error from a cancelled context")
	}
}
