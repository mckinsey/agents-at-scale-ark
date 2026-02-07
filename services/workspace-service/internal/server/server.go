package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"go.uber.org/zap"

	"mckinsey.com/workspace-service/internal/workspace"
)

type Server struct {
	logger *zap.Logger
	addr   string
	mgr    *workspace.Manager
	mux    *http.ServeMux
}

func New(logger *zap.Logger, addr string, mgr *workspace.Manager) *Server {
	s := &Server{
		logger: logger,
		addr:   addr,
		mgr:    mgr,
		mux:    http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) ListenAndServe() error {
	return http.ListenAndServe(s.addr, s.mux)
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", s.handleHealthz)
	s.mux.HandleFunc("/workspaces/provision", s.handleProvision)
	s.mux.HandleFunc("/workspaces/", s.handleWorkspace)
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
}

func (s *Server) handleProvision(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req workspace.ProvisionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := s.mgr.Provision(req)
	if err != nil {
		s.logger.Error("provision failed", zap.Error(err))
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleWorkspace(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/workspaces/")
	parts := strings.SplitN(path, "/", 2)
	if len(parts) == 0 || parts[0] == "" {
		http.Error(w, "workspace ID required", http.StatusBadRequest)
		return
	}

	id := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch {
	case action == "acquire" && r.Method == http.MethodPost:
		s.handleAcquire(w, r, id)
	case action == "release" && r.Method == http.MethodPost:
		s.handleRelease(w, r, id)
	case action == "status" && r.Method == http.MethodGet:
		s.handleStatus(w, r, id)
	case action == "" && r.Method == http.MethodDelete:
		s.handleCleanup(w, r, id)
	default:
		http.Error(w, "not found", http.StatusNotFound)
	}
}

func (s *Server) handleAcquire(w http.ResponseWriter, r *http.Request, id string) {
	var req workspace.AcquireRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := s.mgr.Acquire(id, req)
	if err != nil {
		if _, ok := err.(*workspace.WorkspaceInUseError); ok {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if _, ok := err.(*workspace.WorkspaceNotFoundError); ok {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleRelease(w http.ResponseWriter, r *http.Request, id string) {
	var req workspace.ReleaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if err := s.mgr.Release(id, req); err != nil {
		if _, ok := err.(*workspace.WorkspaceNotFoundError); ok {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCleanup(w http.ResponseWriter, r *http.Request, id string) {
	if err := s.mgr.Cleanup(id); err != nil {
		if _, ok := err.(*workspace.WorkspaceNotFoundError); ok {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request, id string) {
	resp, err := s.mgr.Status(id)
	if err != nil {
		if _, ok := err.(*workspace.WorkspaceNotFoundError); ok {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	s.writeJSON(w, http.StatusOK, resp)
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
