package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func setupWorkspaceTestClient(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = corev1.AddToScheme(scheme)
	_ = arkv1alpha1.AddToScheme(scheme)

	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		Build()
}

func boolPtr(b bool) *bool {
	return &b
}

func TestResolveQueryWorkspace_Nil(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)
	result, err := ResolveQueryWorkspace(context.Background(), k8sClient, nil, "default")
	require.NoError(t, err)
	require.Nil(t, result)
}

func TestResolveQueryWorkspace_Inline(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)
	ws := &arkv1alpha1.QueryWorkspace{
		Content: &arkv1alpha1.WorkspaceContent{
			Git: &arkv1alpha1.WorkspaceContentGit{
				URL:    "https://github.com/org/repo.git",
				Branch: "main",
			},
		},
		MountPath: "/workspace",
	}

	result, err := ResolveQueryWorkspace(context.Background(), k8sClient, ws, "default")
	require.NoError(t, err)
	require.Equal(t, ws, result)
}

func TestResolveQueryWorkspace_RefNotFound(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)
	ws := &arkv1alpha1.QueryWorkspace{
		Ref: &arkv1alpha1.WorkspaceRef{Name: "nonexistent"},
	}

	_, err := ResolveQueryWorkspace(context.Background(), k8sClient, ws, "default")
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to fetch workspace")
}

func TestResolveQueryWorkspace_RefBasic(t *testing.T) {
	wsCRD := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "my-workspace",
			Namespace: "default",
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Environment: &arkv1alpha1.WorkspaceEnvironment{
				Image: &arkv1alpha1.WorkspaceImage{Ref: "python:3.11-slim"},
			},
			Content: &arkv1alpha1.WorkspaceContent{
				Git: &arkv1alpha1.WorkspaceContentGit{
					URL:    "git@github.com:org/repo.git",
					Branch: "main",
				},
			},
			MountPath:  "/workspace",
			Persistent: boolPtr(true),
			AutoCommit: &arkv1alpha1.WorkspaceAutoCommit{
				Enabled:   true,
				Message:   "Changes by agent",
				UserName:  "Agent",
				UserEmail: "agent@example.com",
			},
		},
	}

	k8sClient := setupWorkspaceTestClient([]client.Object{wsCRD})
	ws := &arkv1alpha1.QueryWorkspace{
		Ref:       &arkv1alpha1.WorkspaceRef{Name: "my-workspace"},
		SessionId: "session-123",
	}

	result, err := ResolveQueryWorkspace(context.Background(), k8sClient, ws, "default")
	require.NoError(t, err)
	require.NotNil(t, result)

	require.Equal(t, "python:3.11-slim", result.Environment.Image.Ref)
	require.Equal(t, "git@github.com:org/repo.git", result.Content.Git.URL)
	require.Equal(t, "main", result.Content.Git.Branch)
	require.Equal(t, "/workspace", result.MountPath)
	require.Equal(t, true, *result.Persistent)
	require.Equal(t, true, result.AutoCommit.Enabled)
	require.Equal(t, "Changes by agent", result.AutoCommit.Message)
	require.Equal(t, "session-123", result.SessionId)
	require.Equal(t, "my-workspace", result.Ref.Name)
}

func TestResolveQueryWorkspace_RefCrossNamespace(t *testing.T) {
	wsCRD := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "shared-workspace",
			Namespace: "shared",
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Git: &arkv1alpha1.WorkspaceContentGit{
					URL:    "git@github.com:org/shared.git",
					Branch: "main",
				},
			},
			MountPath: "/workspace",
		},
	}

	k8sClient := setupWorkspaceTestClient([]client.Object{wsCRD})
	ws := &arkv1alpha1.QueryWorkspace{
		Ref: &arkv1alpha1.WorkspaceRef{Name: "shared-workspace", Namespace: "shared"},
	}

	result, err := ResolveQueryWorkspace(context.Background(), k8sClient, ws, "default")
	require.NoError(t, err)
	require.Equal(t, "git@github.com:org/shared.git", result.Content.Git.URL)
}

func TestResolveQueryWorkspace_RefWithOverrides(t *testing.T) {
	wsCRD := &arkv1alpha1.Workspace{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "base-workspace",
			Namespace: "default",
		},
		Spec: arkv1alpha1.WorkspaceSpec{
			Content: &arkv1alpha1.WorkspaceContent{
				Git: &arkv1alpha1.WorkspaceContentGit{
					URL:    "git@github.com:org/repo.git",
					Branch: "main",
					Depth:  1,
					AuthSecretRef: &corev1.SecretKeySelector{
						LocalObjectReference: corev1.LocalObjectReference{Name: "git-creds"},
						Key:                  "token",
					},
				},
			},
			MountPath:  "/workspace",
			Persistent: boolPtr(true),
			AutoCommit: &arkv1alpha1.WorkspaceAutoCommit{
				Enabled:    true,
				Message:    "Default commit",
				PushBranch: "main",
				UserName:   "Agent",
				UserEmail:  "agent@example.com",
			},
		},
	}

	k8sClient := setupWorkspaceTestClient([]client.Object{wsCRD})
	ws := &arkv1alpha1.QueryWorkspace{
		Ref: &arkv1alpha1.WorkspaceRef{Name: "base-workspace"},
		Overrides: &arkv1alpha1.WorkspaceOverrides{
			Content: &arkv1alpha1.WorkspaceContent{
				Git: &arkv1alpha1.WorkspaceContentGit{
					Branch: "feature/new-api",
				},
			},
			AutoCommit: &arkv1alpha1.WorkspaceAutoCommit{
				PushBranch: "review/new-api",
			},
		},
	}

	result, err := ResolveQueryWorkspace(context.Background(), k8sClient, ws, "default")
	require.NoError(t, err)
	require.NotNil(t, result)

	require.Equal(t, "git@github.com:org/repo.git", result.Content.Git.URL)
	require.Equal(t, "feature/new-api", result.Content.Git.Branch)
	require.Equal(t, 1, result.Content.Git.Depth)
	require.Equal(t, "git-creds", result.Content.Git.AuthSecretRef.Name)

	require.Equal(t, true, result.AutoCommit.Enabled)
	require.Equal(t, "Default commit", result.AutoCommit.Message)
	require.Equal(t, "review/new-api", result.AutoCommit.PushBranch)
	require.Equal(t, "Agent", result.AutoCommit.UserName)
	require.Equal(t, "agent@example.com", result.AutoCommit.UserEmail)
}

func TestMergeWorkspaceContent_NilBase(t *testing.T) {
	override := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "https://github.com/org/repo.git",
			Branch: "main",
		},
	}

	result := mergeWorkspaceContent(nil, override)
	require.Equal(t, override, result)
}

func TestMergeWorkspaceContent_GitPartialOverride(t *testing.T) {
	base := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "git@github.com:org/repo.git",
			Branch: "main",
			Path:   "src/",
			Depth:  1,
		},
	}
	override := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			Branch: "feature/x",
		},
	}

	result := mergeWorkspaceContent(base, override)
	require.Equal(t, "git@github.com:org/repo.git", result.Git.URL)
	require.Equal(t, "feature/x", result.Git.Branch)
	require.Equal(t, "src/", result.Git.Path)
	require.Equal(t, 1, result.Git.Depth)
}

func TestMergeWorkspaceContent_ObjectStorageOverride(t *testing.T) {
	base := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "git@github.com:org/repo.git",
			Branch: "main",
		},
	}
	override := &arkv1alpha1.WorkspaceContent{
		ObjectStorage: &arkv1alpha1.WorkspaceContentObjectStorage{
			Provider: "s3",
			Bucket:   "my-bucket",
		},
	}

	result := mergeWorkspaceContent(base, override)
	require.NotNil(t, result.Git)
	require.Equal(t, "s3", result.ObjectStorage.Provider)
}

func TestMergeAutoCommit_NilBase(t *testing.T) {
	override := &arkv1alpha1.WorkspaceAutoCommit{
		Enabled:    true,
		Message:    "Override message",
		PushBranch: "review/branch",
	}

	result := mergeAutoCommit(nil, override)
	require.Equal(t, override, result)
}

func TestMergeAutoCommit_PartialOverride(t *testing.T) {
	base := &arkv1alpha1.WorkspaceAutoCommit{
		Enabled:    true,
		Message:    "Base message",
		PushBranch: "main",
		UserName:   "Agent",
		UserEmail:  "agent@example.com",
	}
	override := &arkv1alpha1.WorkspaceAutoCommit{
		PushBranch: "review/feature",
	}

	result := mergeAutoCommit(base, override)
	require.Equal(t, true, result.Enabled)
	require.Equal(t, "Base message", result.Message)
	require.Equal(t, "review/feature", result.PushBranch)
	require.Equal(t, "Agent", result.UserName)
	require.Equal(t, "agent@example.com", result.UserEmail)
}

func TestMergeGitContent_NilBase(t *testing.T) {
	override := &arkv1alpha1.WorkspaceContentGit{
		URL:    "https://github.com/org/repo.git",
		Branch: "main",
	}

	result := mergeGitContent(nil, override)
	require.Equal(t, override, result)
}

func TestMergeGitContent_SparsePathsOverride(t *testing.T) {
	base := &arkv1alpha1.WorkspaceContentGit{
		URL:         "git@github.com:org/repo.git",
		Branch:      "main",
		SparsePaths: []string{"src/", "lib/"},
	}
	override := &arkv1alpha1.WorkspaceContentGit{
		SparsePaths: []string{"docs/"},
	}

	result := mergeGitContent(base, override)
	require.Equal(t, "git@github.com:org/repo.git", result.URL)
	require.Equal(t, "main", result.Branch)
	require.Equal(t, []string{"docs/"}, result.SparsePaths)
}

func TestBuildContentRequest_Git(t *testing.T) {
	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "https://github.com/org/repo.git",
			Branch: "develop",
			Path:   "src/",
			Depth:  1,
		},
	}
	result := buildContentRequest(content)
	require.NotNil(t, result.Git)
	require.Equal(t, "https://github.com/org/repo.git", result.Git.URL)
	require.Equal(t, "develop", result.Git.Branch)
	require.Equal(t, "src/", result.Git.Path)
	require.Equal(t, 1, result.Git.Depth)
	require.Nil(t, result.ObjectStorage)
	require.Nil(t, result.Archive)
	require.Nil(t, result.Empty)
}

func TestBuildContentRequest_ObjectStorage(t *testing.T) {
	content := &arkv1alpha1.WorkspaceContent{
		ObjectStorage: &arkv1alpha1.WorkspaceContentObjectStorage{
			Provider: "s3",
			Bucket:   "my-bucket",
			Prefix:   "data/",
		},
	}
	result := buildContentRequest(content)
	require.NotNil(t, result.ObjectStorage)
	require.Equal(t, "s3", result.ObjectStorage.Provider)
	require.Equal(t, "my-bucket", result.ObjectStorage.Bucket)
	require.Equal(t, "data/", result.ObjectStorage.Prefix)
	require.Nil(t, result.Git)
}

func TestBuildContentRequest_Archive(t *testing.T) {
	content := &arkv1alpha1.WorkspaceContent{
		Archive: &arkv1alpha1.WorkspaceContentArchive{
			URL:    "https://example.com/archive.tar.gz",
			Format: "tar.gz",
		},
	}
	result := buildContentRequest(content)
	require.NotNil(t, result.Archive)
	require.Equal(t, "https://example.com/archive.tar.gz", result.Archive.URL)
	require.Equal(t, "tar.gz", result.Archive.Format)
	require.Nil(t, result.Git)
}

func TestBuildContentRequest_Empty(t *testing.T) {
	content := &arkv1alpha1.WorkspaceContent{
		Empty: &arkv1alpha1.WorkspaceContentEmpty{},
	}
	result := buildContentRequest(content)
	require.NotNil(t, result.Empty)
	require.Nil(t, result.Git)
	require.Nil(t, result.ObjectStorage)
	require.Nil(t, result.Archive)
}

func TestBuildContentRequest_Multiple(t *testing.T) {
	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "https://github.com/org/repo.git",
			Branch: "main",
		},
		ObjectStorage: &arkv1alpha1.WorkspaceContentObjectStorage{
			Provider: "gcs",
			Bucket:   "other-bucket",
		},
	}
	result := buildContentRequest(content)
	require.NotNil(t, result.Git)
	require.NotNil(t, result.ObjectStorage)
	require.Equal(t, "https://github.com/org/repo.git", result.Git.URL)
	require.Equal(t, "gcs", result.ObjectStorage.Provider)
}

func TestResolveWorkspaceCredentials_NilContent(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)
	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, nil, "default")
	require.NoError(t, err)
	require.Nil(t, creds)
}

func TestResolveWorkspaceCredentials_NoAuthRef(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)
	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL:    "https://github.com/org/repo.git",
			Branch: "main",
		},
	}
	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Nil(t, creds)
}

func TestResolveWorkspaceCredentials_GitSecret(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "git-creds", Namespace: "default"},
		Data:       map[string][]byte{"token": []byte("ghp_secret123")},
	}
	k8sClient := setupWorkspaceTestClient([]client.Object{secret})

	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL: "https://github.com/org/repo.git",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "git-creds"},
				Key:                  "token",
			},
		},
	}

	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Equal(t, "ghp_secret123", creds["token"])
}

func TestResolveWorkspaceCredentials_GitSecret_DefaultKey(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "git-creds", Namespace: "default"},
		Data:       map[string][]byte{"token": []byte("ghp_default")},
	}
	k8sClient := setupWorkspaceTestClient([]client.Object{secret})

	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL: "https://github.com/org/repo.git",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "git-creds"},
			},
		},
	}

	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Equal(t, "ghp_default", creds["token"])
}

func TestResolveWorkspaceCredentials_S3Secret(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "s3-creds", Namespace: "default"},
		Data: map[string][]byte{
			"accessKeyId":     []byte("AKID123"),
			"secretAccessKey": []byte("SECRET456"),
			"region":          []byte("us-east-1"),
		},
	}
	k8sClient := setupWorkspaceTestClient([]client.Object{secret})

	content := &arkv1alpha1.WorkspaceContent{
		ObjectStorage: &arkv1alpha1.WorkspaceContentObjectStorage{
			Provider: "s3",
			Bucket:   "my-bucket",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "s3-creds"},
			},
		},
	}

	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Equal(t, "AKID123", creds["accessKeyId"])
	require.Equal(t, "SECRET456", creds["secretAccessKey"])
	require.Equal(t, "us-east-1", creds["region"])
}

func TestResolveWorkspaceCredentials_AzureSecret(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "azure-creds", Namespace: "default"},
		Data: map[string][]byte{
			"storageAccount": []byte("myaccount"),
			"storageKey":     []byte("mykey"),
		},
	}
	k8sClient := setupWorkspaceTestClient([]client.Object{secret})

	content := &arkv1alpha1.WorkspaceContent{
		ObjectStorage: &arkv1alpha1.WorkspaceContentObjectStorage{
			Provider: "azure",
			Bucket:   "my-container",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "azure-creds"},
			},
		},
	}

	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Equal(t, "myaccount", creds["storageAccount"])
	require.Equal(t, "mykey", creds["storageKey"])
}

func TestResolveWorkspaceCredentials_ArchiveSecret(t *testing.T) {
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: "archive-creds", Namespace: "default"},
		Data:       map[string][]byte{"token": []byte("bearer-token")},
	}
	k8sClient := setupWorkspaceTestClient([]client.Object{secret})

	content := &arkv1alpha1.WorkspaceContent{
		Archive: &arkv1alpha1.WorkspaceContentArchive{
			URL: "https://example.com/archive.tar.gz",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "archive-creds"},
				Key:                  "token",
			},
		},
	}

	creds, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.NoError(t, err)
	require.Equal(t, "bearer-token", creds["token"])
}

func TestResolveWorkspaceCredentials_SecretNotFound(t *testing.T) {
	k8sClient := setupWorkspaceTestClient(nil)

	content := &arkv1alpha1.WorkspaceContent{
		Git: &arkv1alpha1.WorkspaceContentGit{
			URL: "https://github.com/org/repo.git",
			AuthSecretRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: "nonexistent"},
				Key:                  "token",
			},
		},
	}

	_, err := ResolveWorkspaceCredentials(context.Background(), k8sClient, content, "default")
	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to get git credentials secret")
}
