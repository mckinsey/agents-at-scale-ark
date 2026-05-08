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
	// +kubebuilder:validation:Optional
	ValueFrom *ValueFromSource `json:"valueFrom,omitempty"`
}

type ToolPartial struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	// Name to override the tool's name as exposed to the agent (optional)
	Name string `json:"name,omitempty"`
	// +kubebuilder:validation:Optional
	// Parameters to preconfigure and hide from the agent; injected at runtime and not visible/editable by the agent (optional)
	Parameters []ToolFunction `json:"parameters,omitempty"`
}

// ApproverRef specifies who can approve tool calls. At least one field must be set.
type ApproverRef struct {
	// +kubebuilder:validation:Optional
	// Role name - user must be bound to a ClusterRole/Role with this name
	Role string `json:"role,omitempty"`
	// +kubebuilder:validation:Optional
	// User identity - must match the authenticated user's identity
	User string `json:"user,omitempty"`
	// +kubebuilder:validation:Optional
	// Group name - user must belong to this group
	Group string `json:"group,omitempty"`
}

// ToolInteractionApprovalConfig configures approval-type interaction settings.
type ToolInteractionApprovalConfig struct {
	// +kubebuilder:validation:Optional
	// Approvers specifies who can approve this tool. If empty, any user with ToolInteraction update permission can approve.
	Approvers []ApproverRef `json:"approvers,omitempty"`
	// +kubebuilder:validation:Optional
	// ReasonRequired specifies whether a reason must be provided when rejecting the tool call
	ReasonRequired bool `json:"reasonRequired,omitempty"`
}

// ToolInteractionInputConfig configures input-type interaction settings.
type ToolInteractionInputConfig struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Schemaless
	// Schema is a JSON Schema defining the required input structure
	Schema *runtime.RawExtension `json:"schema,omitempty"`
	// +kubebuilder:validation:Optional
	// Prompt to display to the user when requesting input
	Prompt string `json:"prompt,omitempty"`
}

// ToolInteractionSelectionOption represents a selectable option.
type ToolInteractionSelectionOption struct {
	// +kubebuilder:validation:Required
	Value string `json:"value"`
	// +kubebuilder:validation:Required
	Label string `json:"label"`
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
}

// ToolInteractionSelectionConfig configures selection-type interaction settings.
type ToolInteractionSelectionConfig struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinItems=1
	Options []ToolInteractionSelectionOption `json:"options"`
	// +kubebuilder:validation:Optional
	// MultiSelect allows selecting multiple options
	MultiSelect bool `json:"multiSelect,omitempty"`
	// +kubebuilder:validation:Optional
	// Prompt to display to the user when requesting selection
	Prompt string `json:"prompt,omitempty"`
}

// ToolInteractionConfirmationConfig configures confirmation-type interaction settings.
type ToolInteractionConfirmationConfig struct {
	// +kubebuilder:validation:Optional
	// AllowEdit permits the user to modify tool arguments before confirming
	AllowEdit bool `json:"allowEdit,omitempty"`
	// +kubebuilder:validation:Optional
	// Message to display to the user when requesting confirmation
	Message string `json:"message,omitempty"`
}

// ToolInteractionConfig configures human-in-the-loop interaction for a tool.
type ToolInteractionConfig struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=approval;input;selection;confirmation
	// Type specifies the kind of interaction required
	Type string `json:"type"`
	// +kubebuilder:validation:Optional
	// Timeout is the maximum duration to wait for interaction before taking the onTimeout action
	Timeout *metav1.Duration `json:"timeout,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=reject;proceed
	// +kubebuilder:default=reject
	// OnTimeout specifies what to do when interaction times out: "reject" (default) fails the tool call, "proceed" auto-accepts
	OnTimeout string `json:"onTimeout,omitempty"`
	// +kubebuilder:validation:Optional
	// Approval contains configuration for approval-type interactions
	Approval *ToolInteractionApprovalConfig `json:"approval,omitempty"`
	// +kubebuilder:validation:Optional
	// Input contains configuration for input-type interactions
	Input *ToolInteractionInputConfig `json:"input,omitempty"`
	// +kubebuilder:validation:Optional
	// Selection contains configuration for selection-type interactions
	Selection *ToolInteractionSelectionConfig `json:"selection,omitempty"`
	// +kubebuilder:validation:Optional
	// Confirmation contains configuration for confirmation-type interactions
	Confirmation *ToolInteractionConfirmationConfig `json:"confirmation,omitempty"`
}

type AgentTool struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=built-in;custom;mcp;http;agent;team;builtin
	Type string `json:"type"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name,omitempty"`
	// +kubebuilder:validation:Optional
	// Description of the tool as exposed to the agent
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	Functions []ToolFunction `json:"functions,omitempty"`
	// +kubebuilder:validation:Optional
	// ToolPartial allows overriding the tool's name and preconfiguring or hiding tool parameters
	// from the agent. Parameters defined here are injected at runtime and are not visible or
	// editable by the agent itself.
	Partial *ToolPartial `json:"partial,omitempty"`
	// +kubebuilder:validation:Optional
	// Interaction configures human-in-the-loop interaction for this tool
	Interaction *ToolInteractionConfig `json:"interaction,omitempty"`
}

// GetToolCRDName returns the actual Tool CRD name to lookup in Kubernetes.
// For partial tools, this is the partial.name (the actual tool CRD).
// Otherwise, it's the tool name (exposed name and CRD name are the same).
func (a *AgentTool) GetToolCRDName() string {
	if a.Partial != nil && a.Partial.Name != "" {
		return a.Partial.Name
	}
	return a.Name
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
