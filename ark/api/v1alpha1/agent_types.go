/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

type ToolFunction struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Value string `json:"value,omitempty"`
}

type AgentTool struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=built-in;custom
	Type string `json:"type"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name,omitempty"`
	// +kubebuilder:validation:Optional
	Functions []ToolFunction `json:"functions,omitempty"`
}

type AgentModelRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

// ExecutionEngineRef references an external or internal engine that can execute agent workloads.
// This allows agents to be run using different frameworks such as LangChain, AutoGen, or other
// agent execution systems, rather than the built-in OpenAI-compatible engine.
type ExecutionEngineRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	// Name of the ExecutionEngine resource to use for this agent
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	// Namespace of the ExecutionEngine resource. Defaults to the agent's namespace if not specified
	Namespace string `json:"namespace,omitempty"`
}
type AgentSpec struct {
	Prompt      string `json:"prompt,omitempty"`
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	ModelRef *AgentModelRef `json:"modelRef,omitempty"`
	// +kubebuilder:validation:Optional
	// ExecutionEngine to use for running this agent. If not specified, uses the built-in OpenAI-compatible engine
	ExecutionEngine *ExecutionEngineRef `json:"executionEngine,omitempty"`
	Tools           []AgentTool         `json:"tools,omitempty"`
	// +kubebuilder:validation:Optional
	// Parameters for template processing in the prompt field
	Parameters []Parameter `json:"parameters,omitempty"`
	// +kubebuilder:validation:Optional
	// JSON schema for structured output format
	OutputSchema *runtime.RawExtension `json:"outputSchema,omitempty"`
}

type AgentStatus struct{}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:storageversion
type Agent struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   AgentSpec   `json:"spec,omitempty"`
	Status AgentStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type AgentList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Agent `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Agent{}, &AgentList{})
}
