package routing

import (
	"reflect"
	"testing"
)

func TestParseHeaders(t *testing.T) {
	tests := []struct {
		name       string
		headersStr string
		want       map[string]string
	}{
		{
			name:       "single header",
			headersStr: "Authorization=Bearer token123",
			want: map[string]string{
				"Authorization": "Bearer token123",
			},
		},
		{
			name:       "multiple headers",
			headersStr: "x-api-key=abc123,x-tenant-id=tenant1",
			want: map[string]string{
				"x-api-key":   "abc123",
				"x-tenant-id": "tenant1",
			},
		},
		{
			name:       "headers with spaces",
			headersStr: "  Authorization = Bearer token  , x-api-key = value  ",
			want: map[string]string{
				"Authorization": "Bearer token",
				"x-api-key":     "value",
			},
		},
		{
			name:       "empty string",
			headersStr: "",
			want:       map[string]string{},
		},
		{
			name:       "invalid format ignored",
			headersStr: "valid=value,invalid-no-equals,another=good",
			want: map[string]string{
				"valid":   "value",
				"another": "good",
			},
		},
		{
			name:       "honeycomb style",
			headersStr: "x-honeycomb-team=api_key_here",
			want: map[string]string{
				"x-honeycomb-team": "api_key_here",
			},
		},
		{
			name:       "value with equals sign",
			headersStr: "Authorization=Basic dXNlcjpwYXNz==",
			want: map[string]string{
				"Authorization": "Basic dXNlcjpwYXNz==",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := parseHeaders(tt.headersStr)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("parseHeaders() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want string
	}{
		{
			name: "http URL with port",
			url:  "http://collector.example.com:4318/v1/traces",
			want: "collector.example.com:4318",
		},
		{
			name: "https URL with port",
			url:  "https://api.honeycomb.io:443/v1/traces",
			want: "api.honeycomb.io:443",
		},
		{
			name: "URL without port",
			url:  "https://collector.example.com/v1/traces",
			want: "collector.example.com",
		},
		{
			name: "URL without path",
			url:  "http://localhost:4318",
			want: "localhost:4318",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractHost(tt.url)
			if got != tt.want {
				t.Errorf("extractHost() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExtractPath(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want string
	}{
		{
			name: "URL with path",
			url:  "http://collector.example.com:4318/v1/traces",
			want: "/v1/traces",
		},
		{
			name: "URL with nested path",
			url:  "http://langfuse.svc:3000/api/public/otel",
			want: "/api/public/otel",
		},
		{
			name: "URL without path",
			url:  "http://localhost:4318",
			want: "/",
		},
		{
			name: "https URL with path",
			url:  "https://api.honeycomb.io/v1/traces",
			want: "/v1/traces",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractPath(tt.url)
			if got != tt.want {
				t.Errorf("extractPath() = %v, want %v", got, tt.want)
			}
		})
	}
}
