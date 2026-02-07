package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"

	"mckinsey.com/workspace-service/internal/provisioner/content"
)

type mockProvisioner struct {
	called     bool
	params     content.ProvisionParams
	returnErr  error
}

func (m *mockProvisioner) Provision(params content.ProvisionParams) error {
	m.called = true
	m.params = params
	return m.returnErr
}

func newTestManager(t *testing.T, provisioners map[string]content.Provisioner) *Manager {
	t.Helper()
	return NewManager(zap.NewNop(), t.TempDir(), provisioners, nil)
}

func TestProvision_GitContent(t *testing.T) {
	gitProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"git": gitProv})

	resp, err := mgr.Provision(ProvisionRequest{
		QueryUID: "q-1",
		Content: &ContentSpec{
			Git: &GitSpec{URL: "https://github.com/org/repo.git", Branch: "main", Depth: 1},
		},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ContentType != "git" {
		t.Errorf("expected contentType 'git', got %q", resp.ContentType)
	}
	if !gitProv.called {
		t.Error("git provisioner was not called")
	}
	if gitProv.params.Config["url"] != "https://github.com/org/repo.git" {
		t.Error("git provisioner did not receive correct URL")
	}
	if resp.ID == "" {
		t.Error("expected non-empty workspace ID")
	}
	if _, err := os.Stat(resp.Path); err != nil {
		t.Errorf("workspace directory should exist: %v", err)
	}
}

func TestProvision_EmptyContent(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	resp, err := mgr.Provision(ProvisionRequest{
		QueryUID: "q-2",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ContentType != "empty" {
		t.Errorf("expected contentType 'empty', got %q", resp.ContentType)
	}
	if !emptyProv.called {
		t.Error("empty provisioner was not called")
	}
}

func TestProvision_ObjectStorageContent(t *testing.T) {
	objProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"objectStorage": objProv})

	resp, err := mgr.Provision(ProvisionRequest{
		QueryUID: "q-3",
		Content: &ContentSpec{
			ObjectStorage: &ObjectStorageSpec{Provider: "s3", Bucket: "my-bucket", Prefix: "data/"},
		},
		Credentials: map[string]string{"accessKeyId": "AK", "secretAccessKey": "SK"},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ContentType != "objectStorage" {
		t.Errorf("expected contentType 'objectStorage', got %q", resp.ContentType)
	}
	if objProv.params.Config["provider"] != "s3" {
		t.Error("object storage provisioner did not receive correct provider")
	}
	if objProv.params.Credentials["accessKeyId"] != "AK" {
		t.Error("credentials not passed to provisioner")
	}
}

func TestProvision_ArchiveContent(t *testing.T) {
	archProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"archive": archProv})

	resp, err := mgr.Provision(ProvisionRequest{
		QueryUID: "q-4",
		Content: &ContentSpec{
			Archive: &ArchiveSpec{URL: "https://example.com/archive.tar.gz", Format: "tar.gz"},
		},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.ContentType != "archive" {
		t.Errorf("expected contentType 'archive', got %q", resp.ContentType)
	}
	if archProv.params.Config["url"] != "https://example.com/archive.tar.gz" {
		t.Error("archive provisioner did not receive correct URL")
	}
}

func TestProvision_CreatesDirectoryStructure(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	resp, err := mgr.Provision(ProvisionRequest{
		QueryUID: "q-dir",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	expected := filepath.Join(mgr.basePath, "ephemeral", "q-dir")
	if filepath.Dir(resp.Path) != expected {
		t.Errorf("expected parent dir %q, got %q", expected, filepath.Dir(resp.Path))
	}
}

func TestRelease_Success(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	resp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "q-rel",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	err := mgr.Release(resp.ID, ReleaseRequest{QueryUID: "q-rel"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	status, _ := mgr.Status(resp.ID)
	if status.QueryUID != "" {
		t.Error("QueryUID should be empty after release")
	}
}

func TestRelease_WithAutoCommit(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	resp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "q-ac",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	err := mgr.Release(resp.ID, ReleaseRequest{
		QueryUID: "q-ac",
		AutoCommit: &AutoCommitConfig{
			Enabled:    true,
			Message:    "test commit",
			PushBranch: "main",
			UserName:   "Test",
			UserEmail:  "test@test.com",
		},
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRelease_NotFound(t *testing.T) {
	mgr := newTestManager(t, nil)
	err := mgr.Release("nonexistent", ReleaseRequest{QueryUID: "q"})
	if err == nil {
		t.Fatal("expected error for nonexistent workspace")
	}
	if _, ok := err.(*WorkspaceNotFoundError); !ok {
		t.Errorf("expected WorkspaceNotFoundError, got %T", err)
	}
}

func TestCleanup_RemovesStateAndDirectory(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	resp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "q-clean",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	if _, err := os.Stat(resp.Path); err != nil {
		t.Fatalf("workspace directory should exist before cleanup: %v", err)
	}

	err := mgr.Cleanup(resp.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, err := os.Stat(resp.Path); !os.IsNotExist(err) {
		t.Error("workspace directory should be removed after cleanup")
	}

	_, err = mgr.Status(resp.ID)
	if err == nil {
		t.Error("expected error when getting status after cleanup")
	}
}

func TestCleanup_NotFound(t *testing.T) {
	mgr := newTestManager(t, nil)
	err := mgr.Cleanup("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent workspace")
	}
	if _, ok := err.(*WorkspaceNotFoundError); !ok {
		t.Errorf("expected WorkspaceNotFoundError, got %T", err)
	}
}

func TestAcquire_Success(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	provResp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "original-owner",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	mgr.mu.Lock()
	mgr.workspaces[provResp.ID].QueryUID = ""
	mgr.mu.Unlock()

	acqResp, err := mgr.Acquire(provResp.ID, AcquireRequest{
		QueryUID:  "new-owner",
		SessionID: "session-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if acqResp.Path != provResp.Path {
		t.Errorf("expected path %q, got %q", provResp.Path, acqResp.Path)
	}
	if acqResp.SessionID != "session-1" {
		t.Errorf("expected sessionID 'session-1', got %q", acqResp.SessionID)
	}
}

func TestAcquire_GeneratesSessionID(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	provResp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "owner",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	mgr.mu.Lock()
	mgr.workspaces[provResp.ID].QueryUID = ""
	mgr.mu.Unlock()

	acqResp, err := mgr.Acquire(provResp.ID, AcquireRequest{QueryUID: "new-owner"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if acqResp.SessionID == "" {
		t.Error("expected auto-generated sessionID")
	}
}

func TestAcquire_InUse(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	provResp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "owner-1",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	_, err := mgr.Acquire(provResp.ID, AcquireRequest{QueryUID: "owner-2"})
	if err == nil {
		t.Fatal("expected error when workspace is in use")
	}
	if _, ok := err.(*WorkspaceInUseError); !ok {
		t.Errorf("expected WorkspaceInUseError, got %T", err)
	}
}

func TestAcquire_SameOwner(t *testing.T) {
	emptyProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"empty": emptyProv})

	provResp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "owner-1",
		Content:  &ContentSpec{Empty: &EmptySpec{}},
	})

	_, err := mgr.Acquire(provResp.ID, AcquireRequest{QueryUID: "owner-1"})
	if err != nil {
		t.Fatalf("same owner should be able to re-acquire: %v", err)
	}
}

func TestAcquire_NotFound(t *testing.T) {
	mgr := newTestManager(t, nil)
	_, err := mgr.Acquire("nonexistent", AcquireRequest{QueryUID: "q"})
	if err == nil {
		t.Fatal("expected error for nonexistent workspace")
	}
	if _, ok := err.(*WorkspaceNotFoundError); !ok {
		t.Errorf("expected WorkspaceNotFoundError, got %T", err)
	}
}

func TestStatus_ReturnsCorrectState(t *testing.T) {
	gitProv := &mockProvisioner{}
	mgr := newTestManager(t, map[string]content.Provisioner{"git": gitProv})

	provResp, _ := mgr.Provision(ProvisionRequest{
		QueryUID: "q-status",
		Content: &ContentSpec{
			Git: &GitSpec{URL: "https://github.com/org/repo.git", Branch: "dev"},
		},
		Persistent: true,
	})

	status, err := mgr.Status(provResp.ID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if status.ID != provResp.ID {
		t.Errorf("expected ID %q, got %q", provResp.ID, status.ID)
	}
	if status.Path != provResp.Path {
		t.Errorf("expected path %q, got %q", provResp.Path, status.Path)
	}
	if status.Phase != "Ready" {
		t.Errorf("expected phase 'Ready', got %q", status.Phase)
	}
	if status.ContentType != "git" {
		t.Errorf("expected contentType 'git', got %q", status.ContentType)
	}
	if status.QueryUID != "q-status" {
		t.Errorf("expected queryUID 'q-status', got %q", status.QueryUID)
	}
}

func TestStatus_NotFound(t *testing.T) {
	mgr := newTestManager(t, nil)
	_, err := mgr.Status("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent workspace")
	}
	if _, ok := err.(*WorkspaceNotFoundError); !ok {
		t.Errorf("expected WorkspaceNotFoundError, got %T", err)
	}
}
