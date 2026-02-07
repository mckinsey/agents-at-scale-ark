package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"mckinsey.com/workspace-service/internal/provisioner/content"
	"mckinsey.com/workspace-service/internal/provisioner/environment"
)

type Manager struct {
	logger             *zap.Logger
	basePath           string
	provisioners       map[string]content.Provisioner
	imageProvisioner   *environment.ImageProvisioner
	workspaces         map[string]*workspaceState
	mu                 sync.RWMutex
}

type workspaceState struct {
	ID          string
	Path        string
	ContentType string
	QueryUID    string
	Phase       string
	Persistent  bool
}

func NewManager(logger *zap.Logger, basePath string, provisioners map[string]content.Provisioner, imageProvisioner *environment.ImageProvisioner) *Manager {
	return &Manager{
		logger:           logger,
		basePath:         basePath,
		provisioners:     provisioners,
		imageProvisioner: imageProvisioner,
		workspaces:       make(map[string]*workspaceState),
	}
}

func (m *Manager) Provision(req ProvisionRequest) (*ProvisionResponse, error) {
	id := uuid.New().String()
	wsPath := filepath.Join(m.basePath, "ephemeral", req.QueryUID, id)

	if err := os.MkdirAll(wsPath, 0o755); err != nil {
		return nil, fmt.Errorf("failed to create workspace directory: %w", err)
	}

	if req.Environment != nil && req.Environment.Image != nil && m.imageProvisioner != nil {
		if err := m.imageProvisioner.Provision(environment.ImageProvisionParams{
			ImageRef:   req.Environment.Image.Ref,
			TargetPath: wsPath,
			SourcePath: req.Environment.SourcePath,
		}); err != nil {
			os.RemoveAll(wsPath)
			return nil, fmt.Errorf("failed to provision environment: %w", err)
		}
	}

	contentType := ""
	if req.Content != nil {
		ct, err := m.provisionContent(req.Content, wsPath, req.Credentials)
		if err != nil {
			os.RemoveAll(wsPath)
			return nil, fmt.Errorf("failed to provision content: %w", err)
		}
		contentType = ct
	}

	m.mu.Lock()
	m.workspaces[id] = &workspaceState{
		ID:          id,
		Path:        wsPath,
		ContentType: contentType,
		QueryUID:    req.QueryUID,
		Phase:       "Ready",
		Persistent:  req.Persistent,
	}
	m.mu.Unlock()

	m.logger.Info("workspace provisioned",
		zap.String("id", id),
		zap.String("path", wsPath),
		zap.String("queryUid", req.QueryUID),
		zap.String("contentType", contentType),
	)

	return &ProvisionResponse{
		ID:          id,
		Path:        wsPath,
		ContentType: contentType,
	}, nil
}

func (m *Manager) provisionContent(spec *ContentSpec, targetPath string, credentials map[string]string) (string, error) {
	if spec.Git != nil {
		p, ok := m.provisioners["git"]
		if !ok {
			return "", fmt.Errorf("git provisioner not registered")
		}
		err := p.Provision(content.ProvisionParams{
			TargetPath:  targetPath,
			Credentials: credentials,
			Config: map[string]interface{}{
				"url":    spec.Git.URL,
				"branch": spec.Git.Branch,
				"path":   spec.Git.Path,
				"depth":  spec.Git.Depth,
			},
		})
		return "git", err
	}

	if spec.Empty != nil {
		p, ok := m.provisioners["empty"]
		if !ok {
			return "", fmt.Errorf("empty provisioner not registered")
		}
		err := p.Provision(content.ProvisionParams{
			TargetPath: targetPath,
		})
		return "empty", err
	}

	if spec.ObjectStorage != nil {
		p, ok := m.provisioners["objectStorage"]
		if !ok {
			return "", fmt.Errorf("object storage provisioner not registered")
		}
		err := p.Provision(content.ProvisionParams{
			TargetPath:  targetPath,
			Credentials: credentials,
			Config: map[string]interface{}{
				"provider": spec.ObjectStorage.Provider,
				"bucket":   spec.ObjectStorage.Bucket,
				"prefix":   spec.ObjectStorage.Prefix,
			},
		})
		return "objectStorage", err
	}

	if spec.Archive != nil {
		p, ok := m.provisioners["archive"]
		if !ok {
			return "", fmt.Errorf("archive provisioner not registered")
		}
		err := p.Provision(content.ProvisionParams{
			TargetPath:  targetPath,
			Credentials: credentials,
			Config: map[string]interface{}{
				"url":    spec.Archive.URL,
				"format": spec.Archive.Format,
			},
		})
		return "archive", err
	}

	return "", fmt.Errorf("no content source specified")
}

func (m *Manager) Acquire(id string, req AcquireRequest) (*AcquireResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	ws, ok := m.workspaces[id]
	if !ok {
		return nil, &WorkspaceNotFoundError{WorkspaceID: id}
	}

	if ws.QueryUID != "" && ws.QueryUID != req.QueryUID {
		return nil, &WorkspaceInUseError{
			WorkspaceID: id,
			OwnerUID:    ws.QueryUID,
		}
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = uuid.New().String()
	}

	ws.QueryUID = req.QueryUID

	return &AcquireResponse{
		Path:      ws.Path,
		SessionID: sessionID,
	}, nil
}

type WorkspaceInUseError struct {
	WorkspaceID string
	OwnerUID    string
}

func (e *WorkspaceInUseError) Error() string {
	return fmt.Sprintf("workspace %s is in use by query %s", e.WorkspaceID, e.OwnerUID)
}

type WorkspaceNotFoundError struct {
	WorkspaceID string
}

func (e *WorkspaceNotFoundError) Error() string {
	return fmt.Sprintf("workspace %s not found", e.WorkspaceID)
}

func (m *Manager) Release(id string, req ReleaseRequest) error {
	m.mu.Lock()
	ws, ok := m.workspaces[id]
	if !ok {
		m.mu.Unlock()
		return &WorkspaceNotFoundError{WorkspaceID: id}
	}
	ws.QueryUID = ""
	m.mu.Unlock()

	if req.AutoCommit != nil && req.AutoCommit.Enabled && ws.ContentType == "git" {
		p, ok := m.provisioners["git"]
		if ok {
			if gitP, isGit := p.(*content.GitProvisioner); isGit {
				gitConfig := &content.GitCommitConfig{
					Enabled:    req.AutoCommit.Enabled,
					Message:    req.AutoCommit.Message,
					PushBranch: req.AutoCommit.PushBranch,
					UserName:   req.AutoCommit.UserName,
					UserEmail:  req.AutoCommit.UserEmail,
				}
				if err := gitP.CommitAndPush(ws.Path, gitConfig); err != nil {
					m.logger.Warn("failed to commit/push changes", zap.String("id", id), zap.Error(err))
				}
			}
		}
	}

	m.logger.Info("workspace released", zap.String("id", id))
	return nil
}

func (m *Manager) Cleanup(id string) error {
	m.mu.Lock()
	ws, ok := m.workspaces[id]
	if ok {
		delete(m.workspaces, id)
	}
	m.mu.Unlock()

	if !ok {
		return &WorkspaceNotFoundError{WorkspaceID: id}
	}

	if err := os.RemoveAll(ws.Path); err != nil {
		return fmt.Errorf("failed to remove workspace directory: %w", err)
	}

	m.logger.Info("workspace cleaned up", zap.String("id", id), zap.String("path", ws.Path))
	return nil
}

func (m *Manager) Status(id string) (*StatusResponse, error) {
	m.mu.RLock()
	ws, ok := m.workspaces[id]
	m.mu.RUnlock()

	if !ok {
		return nil, &WorkspaceNotFoundError{WorkspaceID: id}
	}

	return &StatusResponse{
		ID:          ws.ID,
		Path:        ws.Path,
		Phase:       ws.Phase,
		ContentType: ws.ContentType,
		QueryUID:    ws.QueryUID,
	}, nil
}
