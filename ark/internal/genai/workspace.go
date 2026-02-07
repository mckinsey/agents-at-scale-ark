package genai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
)

const (
	defaultWorkspaceServiceTimeout = 60 * time.Second
	workspaceServiceEnvVar         = "WORKSPACE_SERVICE_URL"
	defaultWorkspaceServiceURL     = "http://workspace-service:8090"
)

type ResolvedWorkspace struct {
	Workspace          *arkv1alpha1.QueryWorkspace
	ExistingWorkspaceID string
	ExistingPath        string
}

func ResolveQueryWorkspace(ctx context.Context, k8sClient client.Client, ws *arkv1alpha1.QueryWorkspace, defaultNamespace string) (*ResolvedWorkspace, error) {
	if ws == nil {
		return nil, nil
	}
	if !ws.IsRef() {
		return &ResolvedWorkspace{Workspace: ws}, nil
	}

	namespace := ws.Ref.Namespace
	if namespace == "" {
		namespace = defaultNamespace
	}

	var wsCRD arkv1alpha1.Workspace
	key := types.NamespacedName{Name: ws.Ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, &wsCRD); err != nil {
		return nil, fmt.Errorf("failed to fetch workspace %s: %w", key, err)
	}

	resolved := queryWorkspaceFromSpec(&wsCRD.Spec)

	if ws.Overrides != nil {
		applyWorkspaceOverrides(resolved, ws.Overrides)
	}

	resolved.SessionId = ws.SessionId
	resolved.Ref = ws.Ref

	result := &ResolvedWorkspace{Workspace: resolved}

	if wsCRD.Status.Phase == "Ready" && wsCRD.Status.Path != "" {
		if wsID, ok := wsCRD.Annotations[annotations.WorkspaceID]; ok && wsID != "" {
			result.ExistingWorkspaceID = wsID
			result.ExistingPath = wsCRD.Status.Path
			logf.FromContext(ctx).Info("resolved workspace ref with existing provisioned path", "workspace", key, "workspaceId", wsID, "path", wsCRD.Status.Path)
		}
	} else {
		logf.FromContext(ctx).Info("resolved workspace ref", "workspace", key, "hasOverrides", ws.Overrides != nil)
	}

	return result, nil
}

func ResolveWorkspaceCredentials(ctx context.Context, k8sClient client.Client, content *arkv1alpha1.WorkspaceContent, namespace string) (map[string]string, error) {
	if content == nil {
		return nil, nil
	}

	if content.Git != nil && content.Git.AuthSecretRef != nil {
		return resolveGitCredentials(ctx, k8sClient, content.Git.AuthSecretRef, namespace)
	}

	if content.ObjectStorage != nil && content.ObjectStorage.AuthSecretRef != nil {
		return resolveObjectStorageCredentials(ctx, k8sClient, content.ObjectStorage.AuthSecretRef, content.ObjectStorage.Provider, namespace)
	}

	if content.Archive != nil && content.Archive.AuthSecretRef != nil {
		return resolveArchiveCredentials(ctx, k8sClient, content.Archive.AuthSecretRef, namespace)
	}

	return nil, nil
}

func resolveGitCredentials(ctx context.Context, k8sClient client.Client, ref *corev1.SecretKeySelector, namespace string) (map[string]string, error) {
	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, secret); err != nil {
		return nil, fmt.Errorf("failed to get git credentials secret %s: %w", ref.Name, err)
	}

	secretKey := ref.Key
	if secretKey == "" {
		secretKey = "token"
	}

	value, exists := secret.Data[secretKey]
	if !exists {
		return nil, fmt.Errorf("key %s not found in secret %s", secretKey, ref.Name)
	}

	return map[string]string{"token": string(value)}, nil
}

func resolveObjectStorageCredentials(ctx context.Context, k8sClient client.Client, ref *corev1.SecretKeySelector, provider, namespace string) (map[string]string, error) {
	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, secret); err != nil {
		return nil, fmt.Errorf("failed to get object storage credentials secret %s: %w", ref.Name, err)
	}

	credentials := make(map[string]string)

	switch provider {
	case "s3":
		if v, ok := secret.Data["accessKeyId"]; ok {
			credentials["accessKeyId"] = string(v)
		}
		if v, ok := secret.Data["secretAccessKey"]; ok {
			credentials["secretAccessKey"] = string(v)
		}
		if v, ok := secret.Data["region"]; ok {
			credentials["region"] = string(v)
		}
	case "azure":
		if v, ok := secret.Data["storageAccount"]; ok {
			credentials["storageAccount"] = string(v)
		}
		if v, ok := secret.Data["storageKey"]; ok {
			credentials["storageKey"] = string(v)
		}
	case "gcs":
	}

	if len(credentials) == 0 {
		return nil, nil
	}

	return credentials, nil
}

func resolveArchiveCredentials(ctx context.Context, k8sClient client.Client, ref *corev1.SecretKeySelector, namespace string) (map[string]string, error) {
	secret := &corev1.Secret{}
	key := types.NamespacedName{Name: ref.Name, Namespace: namespace}
	if err := k8sClient.Get(ctx, key, secret); err != nil {
		return nil, fmt.Errorf("failed to get archive credentials secret %s: %w", ref.Name, err)
	}

	secretKey := ref.Key
	if secretKey == "" {
		secretKey = "token"
	}

	value, exists := secret.Data[secretKey]
	if !exists {
		return nil, fmt.Errorf("key %s not found in secret %s", secretKey, ref.Name)
	}

	return map[string]string{"token": string(value)}, nil
}

func queryWorkspaceFromSpec(spec *arkv1alpha1.WorkspaceSpec) *arkv1alpha1.QueryWorkspace {
	return &arkv1alpha1.QueryWorkspace{
		Environment: spec.Environment,
		Content:     spec.Content,
		MountPath:   spec.MountPath,
		Persistent:  spec.Persistent,
		TTL:         spec.TTL,
		Storage:     spec.Storage,
		AutoCommit:  spec.AutoCommit,
	}
}

func applyWorkspaceOverrides(ws *arkv1alpha1.QueryWorkspace, overrides *arkv1alpha1.WorkspaceOverrides) {
	if overrides.Content != nil {
		ws.Content = mergeWorkspaceContent(ws.Content, overrides.Content)
	}
	if overrides.AutoCommit != nil {
		ws.AutoCommit = mergeAutoCommit(ws.AutoCommit, overrides.AutoCommit)
	}
}

func mergeWorkspaceContent(base, override *arkv1alpha1.WorkspaceContent) *arkv1alpha1.WorkspaceContent {
	if base == nil {
		return override
	}

	merged := *base

	if override.Git != nil {
		merged.Git = mergeGitContent(merged.Git, override.Git)
	}
	if override.ObjectStorage != nil {
		merged.ObjectStorage = override.ObjectStorage
	}
	if override.Archive != nil {
		merged.Archive = override.Archive
	}
	if override.Empty != nil {
		merged.Empty = override.Empty
	}

	return &merged
}

func mergeGitContent(base, override *arkv1alpha1.WorkspaceContentGit) *arkv1alpha1.WorkspaceContentGit {
	if base == nil {
		return override
	}

	merged := *base
	if override.URL != "" {
		merged.URL = override.URL
	}
	if override.Branch != "" {
		merged.Branch = override.Branch
	}
	if override.Path != "" {
		merged.Path = override.Path
	}
	if len(override.SparsePaths) > 0 {
		merged.SparsePaths = override.SparsePaths
	}
	if override.Depth != 0 {
		merged.Depth = override.Depth
	}
	if override.AuthSecretRef != nil {
		merged.AuthSecretRef = override.AuthSecretRef
	}
	return &merged
}

func mergeAutoCommit(base, override *arkv1alpha1.WorkspaceAutoCommit) *arkv1alpha1.WorkspaceAutoCommit {
	if base == nil {
		return override
	}

	merged := *base

	if override.Enabled {
		merged.Enabled = true
	}
	if override.Message != "" {
		merged.Message = override.Message
	}
	if override.PushBranch != "" {
		merged.PushBranch = override.PushBranch
	}
	if override.UserName != "" {
		merged.UserName = override.UserName
	}
	if override.UserEmail != "" {
		merged.UserEmail = override.UserEmail
	}

	return &merged
}

type WorkspaceClient struct {
	serviceURL string
	httpClient *http.Client
	recorder   eventing.WorkspaceRecorder
}

func NewWorkspaceClient(recorder eventing.WorkspaceRecorder) *WorkspaceClient {
	serviceURL := os.Getenv(workspaceServiceEnvVar)
	if serviceURL == "" {
		serviceURL = defaultWorkspaceServiceURL
	}
	return &WorkspaceClient{
		serviceURL: serviceURL,
		httpClient: &http.Client{Timeout: defaultWorkspaceServiceTimeout},
		recorder:   recorder,
	}
}

type workspaceProvisionRequest struct {
	QueryUID    string            `json:"queryUid"`
	Environment *wsEnvironment    `json:"environment,omitempty"`
	Content     *wsContent        `json:"content,omitempty"`
	MountPath   string            `json:"mountPath,omitempty"`
	Persistent  bool              `json:"persistent"`
	Credentials map[string]string `json:"credentials,omitempty"`
}

type wsEnvironment struct {
	Image *wsImage `json:"image,omitempty"`
}

type wsImage struct {
	Ref string `json:"ref"`
}

type wsContent struct {
	Git           *wsGit           `json:"git,omitempty"`
	ObjectStorage *wsObjectStorage `json:"objectStorage,omitempty"`
	Archive       *wsArchive       `json:"archive,omitempty"`
	Empty         *wsEmpty         `json:"empty,omitempty"`
}

type wsGit struct {
	URL    string `json:"url"`
	Branch string `json:"branch,omitempty"`
	Path   string `json:"path,omitempty"`
	Depth  int    `json:"depth,omitempty"`
}

type wsObjectStorage struct {
	Provider string `json:"provider"`
	Bucket   string `json:"bucket"`
	Prefix   string `json:"prefix,omitempty"`
}

type wsArchive struct {
	URL    string `json:"url"`
	Format string `json:"format,omitempty"`
}

type wsEmpty struct{}

type wsGitInfo struct {
	LastCommit string `json:"lastCommit,omitempty"`
	Dirty      bool   `json:"dirty,omitempty"`
}

type workspaceProvisionResponse struct {
	ID          string     `json:"id"`
	Path        string     `json:"path"`
	ContentType string     `json:"contentType,omitempty"`
	GitInfo     *wsGitInfo `json:"gitInfo,omitempty"`
}

type workspaceReleaseRequest struct {
	QueryUID   string        `json:"queryUid"`
	AutoCommit *wsAutoCommit `json:"autoCommit,omitempty"`
}

type wsAutoCommit struct {
	Enabled    bool   `json:"enabled"`
	Message    string `json:"message,omitempty"`
	PushBranch string `json:"pushBranch,omitempty"`
	UserName   string `json:"userName,omitempty"`
	UserEmail  string `json:"userEmail,omitempty"`
}

type ProvisionedGitInfo struct {
	LastCommit string
	Dirty      bool
}

type ProvisionedWorkspace struct {
	ID          string
	Path        string
	Config      *WorkspaceConfig
	ContentType string
	GitInfo     *ProvisionedGitInfo
}

func (wc *WorkspaceClient) ProvisionWorkspace(ctx context.Context, queryUID string, ws *arkv1alpha1.QueryWorkspace, credentials map[string]string) (*ProvisionedWorkspace, error) {
	if ws == nil {
		return nil, nil
	}

	operationData := map[string]string{
		"contentType": wc.detectContentType(ws),
	}
	if ws.Environment != nil && ws.Environment.Image != nil {
		operationData["environmentImage"] = ws.Environment.Image.Ref
	}

	if wc.recorder != nil {
		ctx = wc.recorder.Start(ctx, "WorkspaceProvision", "Provisioning workspace", operationData)
	}

	req := buildProvisionRequest(queryUID, ws, credentials)

	provResp, err := wc.sendProvisionRequest(ctx, req)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceProvision", fmt.Sprintf("Workspace provision failed: %v", err), err, operationData)
		}
		return nil, err
	}

	operationData["workspaceId"] = provResp.ID
	operationData["workspacePath"] = provResp.Path
	if wc.recorder != nil {
		wc.recorder.Complete(ctx, "WorkspaceProvision", "Workspace provisioned successfully", operationData)
	}

	logf.FromContext(ctx).Info("workspace provisioned", "id", provResp.ID, "path", provResp.Path)

	persistent := ws.Persistent != nil && *ws.Persistent

	pw := &ProvisionedWorkspace{
		ID:          provResp.ID,
		Path:        provResp.Path,
		ContentType: provResp.ContentType,
		Config: &WorkspaceConfig{
			Path:           provResp.Path,
			SessionId:      ws.SessionId,
			Persistent:     persistent,
			HasEnvironment: ws.Environment != nil,
			HasGit:         provResp.ContentType == "git",
		},
	}

	if provResp.GitInfo != nil {
		pw.GitInfo = &ProvisionedGitInfo{
			LastCommit: provResp.GitInfo.LastCommit,
			Dirty:      provResp.GitInfo.Dirty,
		}
	}

	return pw, nil
}

func (wc *WorkspaceClient) detectContentType(ws *arkv1alpha1.QueryWorkspace) string {
	if ws.Content == nil {
		return "none"
	}
	if ws.Content.Git != nil {
		return "git"
	}
	if ws.Content.ObjectStorage != nil {
		return "objectStorage"
	}
	if ws.Content.Archive != nil {
		return "archive"
	}
	if ws.Content.Empty != nil {
		return "empty"
	}
	return "unknown"
}

func buildProvisionRequest(queryUID string, ws *arkv1alpha1.QueryWorkspace, credentials map[string]string) workspaceProvisionRequest {
	req := workspaceProvisionRequest{
		QueryUID:    queryUID,
		MountPath:   ws.MountPath,
		Credentials: credentials,
	}

	if ws.Persistent != nil {
		req.Persistent = *ws.Persistent
	}

	if ws.Environment != nil && ws.Environment.Image != nil {
		req.Environment = &wsEnvironment{
			Image: &wsImage{Ref: ws.Environment.Image.Ref},
		}
	}

	if ws.Content != nil {
		req.Content = buildContentRequest(ws.Content)
	}

	return req
}

func buildContentRequest(content *arkv1alpha1.WorkspaceContent) *wsContent {
	c := &wsContent{}
	if content.Git != nil {
		c.Git = &wsGit{
			URL:    content.Git.URL,
			Branch: content.Git.Branch,
			Path:   content.Git.Path,
			Depth:  content.Git.Depth,
		}
	}
	if content.ObjectStorage != nil {
		c.ObjectStorage = &wsObjectStorage{
			Provider: content.ObjectStorage.Provider,
			Bucket:   content.ObjectStorage.Bucket,
			Prefix:   content.ObjectStorage.Prefix,
		}
	}
	if content.Archive != nil {
		c.Archive = &wsArchive{
			URL:    content.Archive.URL,
			Format: content.Archive.Format,
		}
	}
	if content.Empty != nil {
		c.Empty = &wsEmpty{}
	}
	return c
}

func (wc *WorkspaceClient) sendProvisionRequest(ctx context.Context, req workspaceProvisionRequest) (*workspaceProvisionResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal provision request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, wc.serviceURL+"/workspaces/provision", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create provision request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := wc.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("workspace provision request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return nil, fmt.Errorf("workspace provision failed with status %d", resp.StatusCode)
	}

	var provResp workspaceProvisionResponse
	if err := json.NewDecoder(resp.Body).Decode(&provResp); err != nil {
		return nil, fmt.Errorf("failed to decode provision response: %w", err)
	}

	return &provResp, nil
}

func (wc *WorkspaceClient) AcquireWorkspace(ctx context.Context, workspaceID string, queryUID string, sessionID string, ws *arkv1alpha1.QueryWorkspace, existingPath string) (*ProvisionedWorkspace, error) {
	operationData := map[string]string{
		"workspaceId": workspaceID,
	}

	if wc.recorder != nil {
		ctx = wc.recorder.Start(ctx, "WorkspaceProvision", "Acquiring existing workspace", operationData)
	}

	req := struct {
		QueryUID  string `json:"queryUid"`
		SessionID string `json:"sessionId,omitempty"`
	}{
		QueryUID:  queryUID,
		SessionID: sessionID,
	}

	body, err := json.Marshal(req)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceProvision", fmt.Sprintf("Failed to marshal acquire request: %v", err), err, operationData)
		}
		return nil, fmt.Errorf("failed to marshal acquire request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/workspaces/%s/acquire", wc.serviceURL, workspaceID), bytes.NewBuffer(body))
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceProvision", fmt.Sprintf("Failed to create acquire request: %v", err), err, operationData)
		}
		return nil, fmt.Errorf("failed to create acquire request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := wc.httpClient.Do(httpReq)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceProvision", fmt.Sprintf("Workspace acquire request failed: %v", err), err, operationData)
		}
		return nil, fmt.Errorf("workspace acquire request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceProvision", fmt.Sprintf("Workspace acquire failed with status %d", resp.StatusCode), fmt.Errorf("status %d", resp.StatusCode), operationData)
		}
		return nil, fmt.Errorf("workspace acquire failed with status %d", resp.StatusCode)
	}

	var acquireResp struct {
		Path      string `json:"path"`
		SessionID string `json:"sessionId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&acquireResp); err != nil {
		return nil, fmt.Errorf("failed to decode acquire response: %w", err)
	}

	operationData["workspacePath"] = acquireResp.Path
	if wc.recorder != nil {
		wc.recorder.Complete(ctx, "WorkspaceProvision", "Workspace provisioned successfully", operationData)
	}

	logf.FromContext(ctx).Info("workspace acquired", "id", workspaceID, "path", acquireResp.Path)

	persistent := ws.Persistent != nil && *ws.Persistent

	return &ProvisionedWorkspace{
		ID:   workspaceID,
		Path: acquireResp.Path,
		Config: &WorkspaceConfig{
			Path:           acquireResp.Path,
			SessionId:      acquireResp.SessionID,
			Persistent:     persistent,
			HasEnvironment: ws.Environment != nil,
			HasGit:         ws.Content != nil && ws.Content.Git != nil,
		},
	}, nil
}

func (wc *WorkspaceClient) ReleaseWorkspace(ctx context.Context, workspaceID string, queryUID string, autoCommit *arkv1alpha1.WorkspaceAutoCommit) error {
	log := logf.FromContext(ctx)

	operationData := map[string]string{
		"workspaceId": workspaceID,
	}
	if autoCommit != nil && autoCommit.Enabled {
		operationData["autoCommit"] = "true"
		if autoCommit.PushBranch != "" {
			operationData["pushBranch"] = autoCommit.PushBranch
		}
	}

	if wc.recorder != nil {
		ctx = wc.recorder.Start(ctx, "WorkspaceRelease", "Releasing workspace", operationData)
	}

	req := workspaceReleaseRequest{
		QueryUID: queryUID,
	}

	if autoCommit != nil && autoCommit.Enabled {
		req.AutoCommit = &wsAutoCommit{
			Enabled:    true,
			Message:    autoCommit.Message,
			PushBranch: autoCommit.PushBranch,
			UserName:   autoCommit.UserName,
			UserEmail:  autoCommit.UserEmail,
		}
	}

	body, err := json.Marshal(req)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceRelease", fmt.Sprintf("Failed to marshal release request: %v", err), err, operationData)
		}
		return fmt.Errorf("failed to marshal release request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/workspaces/%s/release", wc.serviceURL, workspaceID), bytes.NewBuffer(body))
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceRelease", fmt.Sprintf("Failed to create release request: %v", err), err, operationData)
		}
		return fmt.Errorf("failed to create release request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := wc.httpClient.Do(httpReq)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceRelease", fmt.Sprintf("Workspace release request failed: %v", err), err, operationData)
		}
		return fmt.Errorf("workspace release request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		err := fmt.Errorf("workspace release failed with status %d", resp.StatusCode)
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceRelease", err.Error(), err, operationData)
		}
		return err
	}

	if wc.recorder != nil {
		wc.recorder.Complete(ctx, "WorkspaceRelease", "Workspace released successfully", operationData)
	}

	log.Info("workspace released", "id", workspaceID)
	return nil
}

func (wc *WorkspaceClient) CleanupWorkspace(ctx context.Context, workspaceID string) error {
	log := logf.FromContext(ctx)

	operationData := map[string]string{
		"workspaceId": workspaceID,
	}

	if wc.recorder != nil {
		ctx = wc.recorder.Start(ctx, "WorkspaceCleanup", "Cleaning up workspace", operationData)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, fmt.Sprintf("%s/workspaces/%s", wc.serviceURL, workspaceID), nil)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceCleanup", fmt.Sprintf("Failed to create cleanup request: %v", err), err, operationData)
		}
		return fmt.Errorf("failed to create cleanup request: %w", err)
	}

	resp, err := wc.httpClient.Do(httpReq)
	if err != nil {
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceCleanup", fmt.Sprintf("Workspace cleanup request failed: %v", err), err, operationData)
		}
		return fmt.Errorf("workspace cleanup request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		err := fmt.Errorf("workspace cleanup failed with status %d", resp.StatusCode)
		if wc.recorder != nil {
			wc.recorder.Fail(ctx, "WorkspaceCleanup", err.Error(), err, operationData)
		}
		return err
	}

	if wc.recorder != nil {
		wc.recorder.Complete(ctx, "WorkspaceCleanup", "Workspace cleaned up successfully", operationData)
	}

	log.Info("workspace cleaned up", "id", workspaceID)
	return nil
}
