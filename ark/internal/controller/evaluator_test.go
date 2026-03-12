/* Copyright 2025. McKinsey & Company */

package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCallEvaluatorHTTPEndpoint_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/json", r.Header.Get("Content-Type"))

		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var req map[string]interface{}
		err = json.Unmarshal(body, &req)
		require.NoError(t, err)
		assert.Equal(t, "test", req["field"])

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"result": "success"}`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	resp, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	_ = resp.Body.Close()
}

func TestCallEvaluatorHTTPEndpoint_WithEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/evaluate", r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	resp, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "evaluate", request, 5*time.Second)

	require.NoError(t, err)
	require.NotNil(t, resp)
	_ = resp.Body.Close()
}

func TestCallEvaluatorHTTPEndpoint_WithEndpointTrailingSlash(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/evaluate", r.URL.Path)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	resp, err := callEvaluatorHTTPEndpoint(ctx, server.URL+"/", "evaluate", request, 5*time.Second)

	require.NoError(t, err)
	require.NotNil(t, resp)
	_ = resp.Body.Close()
}

func TestCallEvaluatorHTTPEndpoint_MarshalError(t *testing.T) {
	ctx := context.Background()
	invalidRequest := make(chan int)

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, "http://localhost", "", invalidRequest, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to marshal request")
}

func TestCallEvaluatorHTTPEndpoint_InvalidURL(t *testing.T) {
	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, "://invalid-url", "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to create HTTP request")
}

func TestCallEvaluatorHTTPEndpoint_NetworkError(t *testing.T) {
	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, "http://localhost:0", "", request, 1*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to call evaluator")
}

func TestCallEvaluatorHTTPEndpoint_ContextCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(10 * time.Second)
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to call evaluator")
}

func TestCallEvaluatorHTTPEndpoint_Timeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(1 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 100*time.Millisecond)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to call evaluator")
}

func TestCallEvaluatorHTTPEndpoint_Status400WithFastAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"detail": "Invalid input parameters"}`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 400")
	assert.Contains(t, err.Error(), "Invalid input parameters")
}

func TestCallEvaluatorHTTPEndpoint_Status500WithFastAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"detail": "Internal server error occurred"}`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 500")
	assert.Contains(t, err.Error(), "Internal server error occurred")
}

func TestCallEvaluatorHTTPEndpoint_Status404WithPlainTextError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte("Endpoint not found"))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 404")
	assert.Contains(t, err.Error(), "Endpoint not found")
}

func TestCallEvaluatorHTTPEndpoint_Status503WithEmptyBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 503")
}

func TestCallEvaluatorHTTPEndpoint_Status400WithMalformedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"detail": "incomplete json`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 400")
	assert.Contains(t, err.Error(), "incomplete json")
}

func TestCallEvaluatorHTTPEndpoint_Status500WithComplexErrorJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error": "something", "detail": "Model execution failed: timeout"}`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 500")
	assert.Contains(t, err.Error(), "Model execution failed: timeout")
}

func TestCallEvaluatorHTTPEndpoint_Status403(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"detail": "Unauthorized access"}`))
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 403")
	assert.Contains(t, err.Error(), "Unauthorized access")
}

func TestCallEvaluatorHTTPEndpoint_ErrorReadingResponseBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	ctx := context.Background()
	request := map[string]string{"field": "test"}

	//nolint:bodyclose
	_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

	require.Error(t, err)
	assert.Contains(t, err.Error(), "evaluator returned status 500")
}

func TestCallEvaluatorHTTPEndpoint_ErrorMessageFormat(t *testing.T) {
	tests := []struct {
		name               string
		statusCode         int
		responseBody       string
		expectedStatusCode string
		expectedDetail     string
	}{
		{
			name:               "FastAPI error with detail",
			statusCode:         400,
			responseBody:       `{"detail": "Validation error"}`,
			expectedStatusCode: "400",
			expectedDetail:     "Validation error",
		},
		{
			name:               "Plain text error",
			statusCode:         500,
			responseBody:       "Internal Server Error",
			expectedStatusCode: "500",
			expectedDetail:     "Internal Server Error",
		},
		{
			name:               "Empty detail field",
			statusCode:         400,
			responseBody:       `{"detail": ""}`,
			expectedStatusCode: "400",
			expectedDetail:     `{"detail": ""}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.statusCode)
				_, _ = w.Write([]byte(tt.responseBody))
			}))
			defer server.Close()

			ctx := context.Background()
			request := map[string]string{"field": "test"}

			//nolint:bodyclose
			_, err := callEvaluatorHTTPEndpoint(ctx, server.URL, "", request, 5*time.Second)

			require.Error(t, err)
			assert.Contains(t, err.Error(), fmt.Sprintf("evaluator returned status %s", tt.expectedStatusCode))
			assert.Contains(t, err.Error(), tt.expectedDetail)
		})
	}
}

func TestCallEvaluatorHTTPEndpoint_EndpointPaths(t *testing.T) {
	tests := []struct {
		name         string
		baseURL      string
		endpoint     string
		expectedPath string
	}{
		{
			name:         "base URL without trailing slash, endpoint without leading slash",
			baseURL:      "http://example.com",
			endpoint:     "evaluate",
			expectedPath: "/evaluate",
		},
		{
			name:         "base URL with trailing slash, endpoint without leading slash",
			baseURL:      "http://example.com/",
			endpoint:     "evaluate",
			expectedPath: "/evaluate",
		},
		{
			name:         "base URL with path, endpoint added",
			baseURL:      "http://example.com/api",
			endpoint:     "evaluate",
			expectedPath: "/api/evaluate",
		},
		{
			name:         "empty endpoint",
			baseURL:      "http://example.com/evaluate",
			endpoint:     "",
			expectedPath: "/evaluate",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pathReceived := ""
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				pathReceived = r.URL.Path
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()

			ctx := context.Background()
			request := map[string]string{"field": "test"}

			testURL := strings.Replace(tt.baseURL, "http://example.com", server.URL, 1)

			resp, err := callEvaluatorHTTPEndpoint(ctx, testURL, tt.endpoint, request, 5*time.Second)

			require.NoError(t, err)
			require.NotNil(t, resp)
			assert.Equal(t, tt.expectedPath, pathReceived)
			_ = resp.Body.Close()
		})
	}
}
