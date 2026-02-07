package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.uber.org/zap"

	"mckinsey.com/workspace-service/internal/provisioner/content"
	"mckinsey.com/workspace-service/internal/workspace"
)

type noopProvisioner struct{}

func (n *noopProvisioner) Provision(_ content.ProvisionParams) error { return nil }

func newTestServer(t *testing.T) (*Server, *workspace.Manager) {
	t.Helper()
	mgr := workspace.NewManager(zap.NewNop(), t.TempDir(), map[string]content.Provisioner{
		"git":           &noopProvisioner{},
		"empty":         &noopProvisioner{},
		"objectStorage": &noopProvisioner{},
		"archive":       &noopProvisioner{},
	}, nil)
	srv := New(zap.NewNop(), ":0", mgr)
	return srv, mgr
}

func provisionWorkspace(t *testing.T, srv *Server) workspace.ProvisionResponse {
	t.Helper()
	body, _ := json.Marshal(workspace.ProvisionRequest{
		QueryUID: "test-query",
		Content:  &workspace.ContentSpec{Empty: &workspace.EmptySpec{}},
	})
	req := httptest.NewRequest(http.MethodPost, "/workspaces/provision", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("provision failed with status %d: %s", w.Code, w.Body.String())
	}
	var resp workspace.ProvisionResponse
	json.NewDecoder(w.Body).Decode(&resp)
	return resp
}

func TestHealthz(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if w.Body.String() != "ok" {
		t.Errorf("expected 'ok', got %q", w.Body.String())
	}
}

func TestProvisionEndpoint_Success(t *testing.T) {
	srv, _ := newTestServer(t)
	body, _ := json.Marshal(workspace.ProvisionRequest{
		QueryUID: "q-1",
		Content:  &workspace.ContentSpec{Empty: &workspace.EmptySpec{}},
	})
	req := httptest.NewRequest(http.MethodPost, "/workspaces/provision", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d", w.Code)
	}
	var resp workspace.ProvisionResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ID == "" {
		t.Error("expected non-empty ID")
	}
	if resp.Path == "" {
		t.Error("expected non-empty path")
	}
}

func TestProvisionEndpoint_BadJSON(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "/workspaces/provision", bytes.NewReader([]byte("invalid json")))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestProvisionEndpoint_MethodNotAllowed(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/workspaces/provision", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}
}

func TestAcquireEndpoint_Conflict(t *testing.T) {
	srv, _ := newTestServer(t)
	provResp := provisionWorkspace(t, srv)

	body, _ := json.Marshal(workspace.AcquireRequest{QueryUID: "different-owner"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/workspaces/%s/acquire", provResp.ID), bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("expected 409 Conflict, got %d: %s", w.Code, w.Body.String())
	}
}

func TestAcquireEndpoint_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	body, _ := json.Marshal(workspace.AcquireRequest{QueryUID: "q"})
	req := httptest.NewRequest(http.MethodPost, "/workspaces/nonexistent/acquire", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestReleaseEndpoint_Success(t *testing.T) {
	srv, _ := newTestServer(t)
	provResp := provisionWorkspace(t, srv)

	body, _ := json.Marshal(workspace.ReleaseRequest{QueryUID: "test-query"})
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/workspaces/%s/release", provResp.ID), bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func TestReleaseEndpoint_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	body, _ := json.Marshal(workspace.ReleaseRequest{QueryUID: "q"})
	req := httptest.NewRequest(http.MethodPost, "/workspaces/nonexistent/release", bytes.NewReader(body))
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestCleanupEndpoint_Success(t *testing.T) {
	srv, _ := newTestServer(t)
	provResp := provisionWorkspace(t, srv)

	req := httptest.NewRequest(http.MethodDelete, fmt.Sprintf("/workspaces/%s", provResp.ID), nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("expected 204, got %d: %s", w.Code, w.Body.String())
	}
}

func TestCleanupEndpoint_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodDelete, "/workspaces/nonexistent", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}

func TestStatusEndpoint_Success(t *testing.T) {
	srv, _ := newTestServer(t)
	provResp := provisionWorkspace(t, srv)

	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/workspaces/%s/status", provResp.ID), nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp workspace.StatusResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.ID != provResp.ID {
		t.Errorf("expected ID %q, got %q", provResp.ID, resp.ID)
	}
	if resp.Phase != "Ready" {
		t.Errorf("expected phase 'Ready', got %q", resp.Phase)
	}
}

func TestStatusEndpoint_NotFound(t *testing.T) {
	srv, _ := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/workspaces/nonexistent/status", nil)
	w := httptest.NewRecorder()
	srv.mux.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
