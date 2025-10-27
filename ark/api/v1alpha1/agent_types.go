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

type ToolPartial struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	// Name to override the tool's name as exposed to the agent (optional)
	Name string `json:"name,omitempty"`
	// +kubebuilder:validation:Optional
	// Description to override the tool's description as exposed to the agent (optional)
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	// Parameters to preconfigure and hide from the agent; injected at runtime and not visible/editable by the agent (optional)
	Parameters []ToolFunction `json:"parameters,omitempty"`
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
	// +kubebuilder:validation:Optional
	// ToolPartial allows overriding the tool's name and description as exposed to the agent,
	// and preconfiguring or hiding tool parameters from the agent. Parameters defined here
	// are injected at runtime and are not visible or editable by the agent itself.
	Partial *ToolPartial `json:"partial,omitempty"`
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
	// +kubebuilder:validation:Optional
	Overrides []Override `json:"overrides,omitempty"`
}

type AgentStatus struct {
	// Conditions represent the latest available observations of an agent's state
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:storageversion
// +kubebuilder:printcolumn:name="Model",type="string",JSONPath=".spec.modelRef.name"
// +kubebuilder:printcolumn:name="Available",type="string",JSONPath=`.status.conditions[?(@.type=="Available")].status`
// +kubebuilder:printcolumn:name="Age",type="date",JSONPath=".metadata.creationTimestamp"
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
