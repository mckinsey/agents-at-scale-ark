/* Copyright 2025. McKinsey & Company */

package v1prealpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ExecutionEngineSpec defines the configuration for an execution engine that can run agent workloads.
// This allows agents to be executed by different frameworks such as LangChain, AutoGen, or other
// agent execution systems, rather than the built-in OpenAI-compatible engine.
// Execution engines work as operators that watch Query CRDs and process queries for agents
// that reference them.
//
// An ExecutionEngine can be configured in two mutually exclusive modes:
// - Address mode: references an externally-managed service via spec.address
// - Container mode: Ark deploys and manages the container via spec.container
type ExecutionEngineSpec struct {
	// Type specifies which execution engine implementation to use.
	// Use "container" when providing a spec.container configuration.
	// +kubebuilder:validation:Required
	Type string `json:"type"`

	// Address specifies how to reach the execution engine.
	// Mutually exclusive with container.
	// +kubebuilder:validation:Optional
	Address *ValueSource `json:"address,omitempty"`

	// Container specifies an OCI image for Ark to deploy and manage as a container-based execution engine.
	// Mutually exclusive with address.
	// +kubebuilder:validation:Optional
	Container *ContainerEngineSpec `json:"container,omitempty"`

	// Description provides human-readable information about this execution engine
	Description string `json:"description,omitempty"`

	// Timeout specifies the HTTP request timeout for this execution engine (e.g., "5m", "30s", "1h").
	// Defaults to "5m" if not specified.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="5m"
	Timeout string `json:"timeout,omitempty"`

	// Streaming indicates whether this engine supports SSE streaming via /execute-stream
	// +kubebuilder:validation:Optional
	Streaming bool `json:"streaming,omitempty"`
}

// ContainerEngineSpec defines an OCI container that Ark will deploy and manage as an execution engine.
type ContainerEngineSpec struct {
	// Image specifies the OCI image to run
	// +kubebuilder:validation:Required
	Image ContainerImageSpec `json:"image"`

	// Command overrides the container entrypoint
	// +kubebuilder:validation:Optional
	Command []string `json:"command,omitempty"`

	// Args overrides the container arguments
	// +kubebuilder:validation:Optional
	Args []string `json:"args,omitempty"`

	// Env specifies additional environment variables for the container
	// +kubebuilder:validation:Optional
	Env []corev1.EnvVar `json:"env,omitempty"`

	// Resources specifies compute resource requirements for the container
	// +kubebuilder:validation:Optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`

	// Port specifies the container port that serves the executor protocol. Defaults to 8000.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=8000
	Port int32 `json:"port,omitempty"`

	// Replicas specifies the number of pod replicas. Defaults to 1.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=1
	Replicas *int32 `json:"replicas,omitempty"`

	// WorkspaceStorage configures workspace volume mounting so the executor can access workspace files
	// +kubebuilder:validation:Optional
	WorkspaceStorage *WorkspaceStorageSpec `json:"workspaceStorage,omitempty"`
}

// WorkspaceStorageSpec configures the workspace PVC mount for container-based execution engines.
type WorkspaceStorageSpec struct {
	// Enabled controls whether the workspace PVC is mounted. Defaults to true when this section is present.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=true
	Enabled bool `json:"enabled"`

	// MountPath is the filesystem path where workspace content is mounted. Defaults to /workspaces.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="/workspaces"
	MountPath string `json:"mountPath,omitempty"`

	// PVCName is the name of the PersistentVolumeClaim to mount. Defaults to workspace-service-pvc.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="workspace-service-pvc"
	PVCName string `json:"pvcName,omitempty"`
}

// ContainerImageSpec references an OCI image
type ContainerImageSpec struct {
	// Ref is the OCI image reference (e.g., "ghcr.io/myorg/my-agent:latest")
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Ref string `json:"ref"`

	// PullSecretRef references a Secret containing image pull credentials
	// +kubebuilder:validation:Optional
	PullSecretRef *corev1.LocalObjectReference `json:"pullSecretRef,omitempty"`
}

type ExecutionEngineStatus struct {
	// +kubebuilder:validation:Optional
	LastResolvedAddress string `json:"lastResolvedAddress,omitempty"`
	Phase               string `json:"phase,omitempty"`
	Message             string `json:"message,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Address",type=string,JSONPath=`.status.lastResolvedAddress`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type ExecutionEngine struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ExecutionEngineSpec   `json:"spec,omitempty"`
	Status ExecutionEngineStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type ExecutionEngineList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ExecutionEngine `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ExecutionEngine{}, &ExecutionEngineList{})
}
