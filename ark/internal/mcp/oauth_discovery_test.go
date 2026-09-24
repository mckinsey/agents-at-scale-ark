/* Copyright 2025. McKinsey & Company */

package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// testDiscoveryTimeout bounds HTTP calls in all discovery tests so a
// hung fake server or network stack cannot lock up the test suite.
// Kept short because every test talks to an in-process httptest server.
const testDiscoveryTimeout = 5 * time.Second

func TestParseResourceMetadataURL(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
		wantOK bool
	}{
		{
			name:   "Notion-style Bearer challenge with resource_metadata",
			header: `Bearer realm="OAuth", resource_metadata="https://mcp.notion.com/.well-known/oauth-protected-resource/mcp", error="invalid_token"`,
			want:   "https://mcp.notion.com/.well-known/oauth-protected-resource/mcp",
			wantOK: true,
		},
		{
			name:   "minimal Bearer with only resource_metadata",
			header: `Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource"`,
			want:   "https://example.com/.well-known/oauth-protected-resource",
			wantOK: true,
		},
		{
			name:   "parameter keys are case-insensitive",
			header: `Bearer Resource_Metadata="https://example.com/meta"`,
			want:   "https://example.com/meta",
			wantOK: true,
		},
		{
			name:   "scheme is case-insensitive",
			header: `bearer resource_metadata="https://example.com/meta"`,
			want:   "https://example.com/meta",
			wantOK: true,
		},
		{
			name:   "empty header",
			header: "",
			wantOK: false,
		},
		{
			name:   "Bearer challenge without resource_metadata",
			header: `Bearer realm="OAuth", error="invalid_token"`,
			wantOK: false,
		},
		{
			name:   "non-Bearer scheme (Basic)",
			header: `Basic realm="test"`,
			wantOK: false,
		},
		{
			name:   "malformed header returns ok=false, not a panic",
			header: `this is not a valid header`,
			wantOK: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := ParseResourceMetadataURL(tt.header)
			if ok != tt.wantOK {
				t.Errorf("ParseResourceMetadataURL(%q) ok = %v, want %v", tt.header, ok, tt.wantOK)
			}
			if got != tt.want {
				t.Errorf("ParseResourceMetadataURL(%q) = %q, want %q", tt.header, got, tt.want)
			}
		})
	}
}

func TestLegacyAuthServerMetadataURL(t *testing.T) {
	tests := []struct {
		name   string
		issuer string
		want   string
	}{
		{"bare authority", "https://mcp.notion.com", "https://mcp.notion.com/.well-known/oauth-authorization-server"},
		{"trailing slash is trimmed", "https://example.com/", "https://example.com/.well-known/oauth-authorization-server"},
		{"multiple trailing slashes are trimmed", "https://example.com//", "https://example.com/.well-known/oauth-authorization-server"},
		{"path is kept in front of the suffix", "https://github.com/login/oauth", "https://github.com/login/oauth/.well-known/oauth-authorization-server"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := legacyAuthServerMetadataURL(tt.issuer)
			if got != tt.want {
				t.Errorf("legacyAuthServerMetadataURL(%q) = %q, want %q", tt.issuer, got, tt.want)
			}
		})
	}
}

func TestIssuerHasPath(t *testing.T) {
	tests := []struct {
		issuer string
		want   bool
	}{
		{"https://mcp.notion.com", false},
		{"https://example.com/", true},
		{"https://github.com/login/oauth", true},
	}

	for _, tt := range tests {
		t.Run(tt.issuer, func(t *testing.T) {
			if got := issuerHasPath(tt.issuer); got != tt.want {
				t.Errorf("issuerHasPath(%q) = %v, want %v", tt.issuer, got, tt.want)
			}
		})
	}
}

// fakeDiscoveryServer stands up a minimal HTTP server that mimics the
// RFC 9728 and RFC 8414 well-known endpoints of a compliant MCP
// authorization server. Used to exercise the fetch helpers without
// reaching real Notion/GitHub endpoints.
func fakeDiscoveryServer(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/oauth-protected-resource/mcp", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"resource":                 host + "/mcp",
			"resource_name":            "Fake MCP",
			"authorization_servers":    []string{host},
			"bearer_methods_supported": []string{"header"},
		})
	})
	mux.HandleFunc("/.well-known/oauth-authorization-server", func(w http.ResponseWriter, r *http.Request) {
		host := "http://" + r.Host
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"issuer":                           host,
			"authorization_endpoint":           host + "/authorize",
			"token_endpoint":                   host + "/token",
			"registration_endpoint":            host + "/register",
			"jwks_uri":                         host + "/.well-known/jwks.json",
			"response_types_supported":         []string{"code"},
			"grant_types_supported":            []string{"authorization_code", "refresh_token"},
			"code_challenge_methods_supported": []string{"S256"},
		})
	})
	return httptest.NewServer(mux)
}

func TestFetchProtectedResourceMetadata(t *testing.T) {
	srv := fakeDiscoveryServer(t)
	defer srv.Close()

	metaURL := srv.URL + "/.well-known/oauth-protected-resource/mcp"
	resourceURL := srv.URL + "/mcp"

	rm, err := FetchProtectedResourceMetadata(context.Background(), metaURL, resourceURL, testDiscoveryTimeout)
	if err != nil {
		t.Fatalf("FetchProtectedResourceMetadata returned error: %v", err)
	}
	if rm.Resource != resourceURL {
		t.Errorf("Resource = %q, want %q", rm.Resource, resourceURL)
	}
	if rm.ResourceName != "Fake MCP" {
		t.Errorf("ResourceName = %q, want %q", rm.ResourceName, "Fake MCP")
	}
	if len(rm.AuthorizationServers) != 1 || rm.AuthorizationServers[0] != srv.URL {
		t.Errorf("AuthorizationServers = %v, want [%s]", rm.AuthorizationServers, srv.URL)
	}
}

func TestFetchProtectedResourceMetadata_ResourceMismatch(t *testing.T) {
	// oauthex validates that the response's `resource` field matches the
	// originally-requested server URL (RFC 9728 §3.3). A mismatch must
	// surface as an error rather than silently returning the payload.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"resource": "https://someone-elses-server.example.com/mcp",
		})
	}))
	defer srv.Close()

	_, err := FetchProtectedResourceMetadata(context.Background(), srv.URL+"/meta", srv.URL+"/mcp", testDiscoveryTimeout)
	if err == nil {
		t.Fatal("expected error for resource mismatch, got nil")
	}
}

func TestFetchProtectedResourceMetadata_NetworkError(t *testing.T) {
	_, err := FetchProtectedResourceMetadata(context.Background(), "http://127.0.0.1:1/unreachable", "http://127.0.0.1:1/unreachable", testDiscoveryTimeout)
	if err == nil {
		t.Fatal("expected error for unreachable endpoint, got nil")
	}
	if !strings.Contains(err.Error(), "fetch protected resource metadata") {
		t.Errorf("error should be wrapped with function context, got %q", err.Error())
	}
}

func TestFetchAuthorizationServerMetadata(t *testing.T) {
	srv := fakeDiscoveryServer(t)
	defer srv.Close()

	asm, err := FetchAuthorizationServerMetadata(context.Background(), srv.URL, testDiscoveryTimeout)
	if err != nil {
		t.Fatalf("FetchAuthorizationServerMetadata returned error: %v", err)
	}
	if asm.AuthorizationEndpoint != srv.URL+"/authorize" {
		t.Errorf("AuthorizationEndpoint = %q, want %q", asm.AuthorizationEndpoint, srv.URL+"/authorize")
	}
	if asm.TokenEndpoint != srv.URL+"/token" {
		t.Errorf("TokenEndpoint = %q, want %q", asm.TokenEndpoint, srv.URL+"/token")
	}
	if asm.RegistrationEndpoint != srv.URL+"/register" {
		t.Errorf("RegistrationEndpoint = %q, want %q", asm.RegistrationEndpoint, srv.URL+"/register")
	}
}

func authServerMetadataDocument(issuer string) map[string]any {
	return map[string]any{
		"issuer":                           issuer,
		"authorization_endpoint":           issuer + "/authorize",
		"token_endpoint":                   issuer + "/access_token",
		"response_types_supported":         []string{"code"},
		"grant_types_supported":            []string{"authorization_code", "refresh_token"},
		"code_challenge_methods_supported": []string{"S256"},
	}
}

func fakeIssuerWithPath(t *testing.T, issuerPath string, metadataPath func(issuerPath string) string) (srv *httptest.Server, issuer string) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc(metadataPath(issuerPath), func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(authServerMetadataDocument("http://" + r.Host + "/" + issuerPath))
	})
	srv = httptest.NewServer(mux)
	return srv, srv.URL + "/" + issuerPath
}

func TestFetchAuthorizationServerMetadata_PathInsertion(t *testing.T) {
	srv, issuer := fakeIssuerWithPath(t, "login/oauth", func(p string) string {
		return "/.well-known/oauth-authorization-server/" + p
	})
	defer srv.Close()

	asm, err := FetchAuthorizationServerMetadata(context.Background(), issuer, testDiscoveryTimeout)
	if err != nil {
		t.Fatalf("FetchAuthorizationServerMetadata returned error: %v", err)
	}
	if asm == nil {
		t.Fatal("expected metadata for a path-inserted well-known document, got nil")
	}
	if asm.AuthorizationEndpoint != issuer+"/authorize" {
		t.Errorf("AuthorizationEndpoint = %q, want %q", asm.AuthorizationEndpoint, issuer+"/authorize")
	}
	if asm.TokenEndpoint != issuer+"/access_token" {
		t.Errorf("TokenEndpoint = %q, want %q", asm.TokenEndpoint, issuer+"/access_token")
	}
}

func TestFetchAuthorizationServerMetadata_LegacyPathAppend(t *testing.T) {
	srv, issuer := fakeIssuerWithPath(t, "login/oauth", func(p string) string {
		return "/" + p + "/.well-known/oauth-authorization-server"
	})
	defer srv.Close()

	asm, err := FetchAuthorizationServerMetadata(context.Background(), issuer, testDiscoveryTimeout)
	if err != nil {
		t.Fatalf("FetchAuthorizationServerMetadata returned error: %v", err)
	}
	if asm == nil {
		t.Fatal("expected metadata from the legacy path-appended document, got nil")
	}
	if asm.TokenEndpoint != issuer+"/access_token" {
		t.Errorf("TokenEndpoint = %q, want %q", asm.TokenEndpoint, issuer+"/access_token")
	}
}

func TestFetchAuthorizationServerMetadata_NotPublished(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()

	asm, err := FetchAuthorizationServerMetadata(context.Background(), srv.URL+"/login/oauth", testDiscoveryTimeout)
	if err != nil {
		t.Fatalf("expected nil error when no candidate is published, got %v", err)
	}
	if asm != nil {
		t.Errorf("expected nil metadata when no candidate is published, got %+v", asm)
	}
}

func TestFetchAuthorizationServerMetadata_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := FetchAuthorizationServerMetadata(context.Background(), srv.URL, testDiscoveryTimeout)
	if err == nil {
		t.Fatal("expected error for a 5xx metadata endpoint, got nil")
	}
	if !strings.Contains(err.Error(), "fetch authorization server metadata") {
		t.Errorf("error should be wrapped with function context, got %q", err.Error())
	}
}
