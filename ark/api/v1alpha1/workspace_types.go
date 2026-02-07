/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type WorkspaceEnvironment struct {
	// +kubebuilder:validation:Optional
	Image *WorkspaceImage `json:"image,omitempty"`
}

type WorkspaceImage struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Ref string `json:"ref"`
	// +kubebuilder:validation:Optional
	SourcePath string `json:"sourcePath,omitempty"`
	// +kubebuilder:validation:Optional
	PullSecretRef *corev1.SecretKeySelector `json:"pullSecretRef,omitempty"`
}

type WorkspaceContentGit struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	URL string `json:"url"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="main"
	Branch string `json:"branch,omitempty"`
	// +kubebuilder:validation:Optional
	Path string `json:"path,omitempty"`
	// +kubebuilder:validation:Optional
	SparsePaths []string `json:"sparsePaths,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=1
	Depth int `json:"depth,omitempty"`
	// +kubebuilder:validation:Optional
	AuthSecretRef *corev1.SecretKeySelector `json:"authSecretRef,omitempty"`
}

type WorkspaceContentObjectStorage struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=s3;gcs;azure
	Provider string `json:"provider"`
	// +kubebuilder:validation:Required
	Bucket string `json:"bucket"`
	// +kubebuilder:validation:Optional
	Prefix string `json:"prefix,omitempty"`
	// +kubebuilder:validation:Optional
	AuthSecretRef *corev1.SecretKeySelector `json:"authSecretRef,omitempty"`
}

type WorkspaceContentArchive struct {
	// +kubebuilder:validation:Required
	URL string `json:"url"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=tar.gz;zip
	// +kubebuilder:default="tar.gz"
	Format string `json:"format,omitempty"`
	// +kubebuilder:validation:Optional
	AuthSecretRef *corev1.SecretKeySelector `json:"authSecretRef,omitempty"`
}

type WorkspaceContentEmpty struct{}

type WorkspaceContent struct {
	// +kubebuilder:validation:Optional
	Git *WorkspaceContentGit `json:"git,omitempty"`
	// +kubebuilder:validation:Optional
	ObjectStorage *WorkspaceContentObjectStorage `json:"objectStorage,omitempty"`
	// +kubebuilder:validation:Optional
	Archive *WorkspaceContentArchive `json:"archive,omitempty"`
	// +kubebuilder:validation:Optional
	Empty *WorkspaceContentEmpty `json:"empty,omitempty"`
}

type WorkspaceAutoCommit struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=false
	Enabled bool `json:"enabled,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="Changes by Ark agent"
	Message string `json:"message,omitempty"`
	// +kubebuilder:validation:Optional
	PushBranch string `json:"pushBranch,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="Ark Agent"
	UserName string `json:"userName,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="ark-agent@noreply.github.com"
	UserEmail string `json:"userEmail,omitempty"`
}

type WorkspaceStorage struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="5Gi"
	Size string `json:"size,omitempty"`
	// +kubebuilder:validation:Optional
	StorageClass string `json:"storageClass,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=ReadWriteOnce;ReadWriteMany
	// +kubebuilder:default="ReadWriteOnce"
	AccessMode string `json:"accessMode,omitempty"`
}

type WorkspaceRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

type WorkspaceOverrides struct {
	// +kubebuilder:validation:Optional
	Content *WorkspaceContent `json:"content,omitempty"`
	// +kubebuilder:validation:Optional
	AutoCommit *WorkspaceAutoCommit `json:"autoCommit,omitempty"`
}

type QueryWorkspace struct {
	// +kubebuilder:validation:Optional
	Ref *WorkspaceRef `json:"ref,omitempty"`
	// +kubebuilder:validation:Optional
	Overrides *WorkspaceOverrides `json:"overrides,omitempty"`
	// +kubebuilder:validation:Optional
	SessionId string `json:"sessionId,omitempty"`
	// +kubebuilder:validation:Optional
	Environment *WorkspaceEnvironment `json:"environment,omitempty"`
	// +kubebuilder:validation:Optional
	Content *WorkspaceContent `json:"content,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="/workspace"
	MountPath string `json:"mountPath,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=true
	Persistent *bool `json:"persistent,omitempty"`
	// +kubebuilder:validation:Optional
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// +kubebuilder:validation:Optional
	Storage *WorkspaceStorage `json:"storage,omitempty"`
	// +kubebuilder:validation:Optional
	AutoCommit *WorkspaceAutoCommit `json:"autoCommit,omitempty"`
}

func (w *QueryWorkspace) IsInline() bool {
	return w.Environment != nil || w.Content != nil
}

func (w *QueryWorkspace) IsRef() bool {
	return w.Ref != nil
}

type WorkspaceSpec struct {
	// +kubebuilder:validation:Optional
	Environment *WorkspaceEnvironment `json:"environment,omitempty"`
	// +kubebuilder:validation:Optional
	Content *WorkspaceContent `json:"content,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="/workspace"
	MountPath string `json:"mountPath,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=true
	Persistent *bool `json:"persistent,omitempty"`
	// +kubebuilder:validation:Optional
	Storage *WorkspaceStorage `json:"storage,omitempty"`
	// +kubebuilder:validation:Optional
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// +kubebuilder:validation:Optional
	AutoCommit *WorkspaceAutoCommit `json:"autoCommit,omitempty"`
}

type WorkspaceEnvironmentStatus struct {
	Image string `json:"image,omitempty"`
	Ready bool   `json:"ready,omitempty"`
}

type WorkspaceGitStatus struct {
	Branch     string `json:"branch,omitempty"`
	LastCommit string `json:"lastCommit,omitempty"`
	Dirty      bool   `json:"dirty,omitempty"`
}

type WorkspaceObjectStorageStatus struct {
	Provider   string       `json:"provider,omitempty"`
	LastSynced *metav1.Time `json:"lastSynced,omitempty"`
}

type WorkspaceArchiveStatus struct {
	ExtractedAt *metav1.Time `json:"extractedAt,omitempty"`
}

type WorkspaceContentStatus struct {
	Type          string                        `json:"type,omitempty"`
	Git           *WorkspaceGitStatus           `json:"git,omitempty"`
	ObjectStorage *WorkspaceObjectStorageStatus `json:"objectStorage,omitempty"`
	Archive       *WorkspaceArchiveStatus       `json:"archive,omitempty"`
}

type WorkspaceStatus struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=Pending;Provisioning;Ready;Error;Terminating
	Phase string `json:"phase,omitempty"`
	// +kubebuilder:validation:Optional
	Path string `json:"path,omitempty"`
	// +kubebuilder:validation:Optional
	PVCName string `json:"pvcName,omitempty"`
	// +kubebuilder:validation:Optional
	LastSynced *metav1.Time `json:"lastSynced,omitempty"`
	// +kubebuilder:validation:Optional
	CurrentOwner string `json:"currentOwner,omitempty"`
	// +kubebuilder:validation:Optional
	EnvironmentStatus *WorkspaceEnvironmentStatus `json:"environmentStatus,omitempty"`
	// +kubebuilder:validation:Optional
	ContentStatus *WorkspaceContentStatus `json:"contentStatus,omitempty"`
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty" patchStrategy:"merge" patchMergeKey:"type"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type="string",JSONPath=".status.phase",description="Phase of the workspace"
// +kubebuilder:printcolumn:name="Path",type="string",JSONPath=".status.path",description="Mount path"
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp",description="Age of the workspace"

type Workspace struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   WorkspaceSpec   `json:"spec,omitempty"`
	Status WorkspaceStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

type WorkspaceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Workspace `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Workspace{}, &WorkspaceList{})
}
