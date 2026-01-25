/* Copyright 2026. McKinsey & Company */

package v1prealpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// ExecutionProfileSpec defines a reusable, SDK-agnostic execution workflow
type ExecutionProfileSpec struct {
	// Workspace configuration for the execution environment
	// +kubebuilder:validation:Optional
	Workspace *WorkspaceConfig `json:"workspace,omitempty"`

	// PreExecute hooks run before the agent executes
	// +kubebuilder:validation:Optional
	PreExecute []Hook `json:"preExecute,omitempty"`

	// Execution constraints (SDK-agnostic: timeouts, iterations)
	// +kubebuilder:validation:Optional
	Execution *ExecutionConstraints `json:"execution,omitempty"`

	// Critic configuration for output validation
	// +kubebuilder:validation:Optional
	Critic *CriticConfig `json:"critic,omitempty"`

	// PostExecute hooks run after successful agent execution
	// +kubebuilder:validation:Optional
	PostExecute []Hook `json:"postExecute,omitempty"`

	// OnFailure hooks run if agent execution fails
	// +kubebuilder:validation:Optional
	OnFailure []Hook `json:"onFailure,omitempty"`

	// SDKConfig contains SDK-specific configuration (opaque to profile, interpreted by executor)
	// For Claude SDK: allowedTools, permissionMode, settingSources, etc.
	// For LangGraph: graph config, etc.
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Optional
	SDKConfig *runtime.RawExtension `json:"sdkConfig,omitempty"`
}

// ExecutionConstraints defines SDK-agnostic execution limits
type ExecutionConstraints struct {
	// Maximum agent iterations/turns (interpreted by executor).
	// For Claude SDK: maps to max_turns parameter.
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	// +kubebuilder:default=25
	MaxIterations int `json:"maxIterations,omitempty"`

	// Timeout for agent execution
	// +kubebuilder:default="30m"
	Timeout string `json:"timeout,omitempty"`

	// Maximum budget in USD as a string (SDK-agnostic, executor maps to SDK-specific param)
	// Example: "10.00" for $10 USD
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Pattern=`^\d+(\.\d{1,2})?$`
	MaxBudgetUsd string `json:"maxBudgetUsd,omitempty"`
}

// WorkspaceConfig defines the execution workspace
type WorkspaceConfig struct {
	// Type of workspace: git, filesystem, or none
	// +kubebuilder:validation:Enum=git;filesystem;none
	// +kubebuilder:default=none
	Type string `json:"type"`

	// Git-specific configuration
	// +kubebuilder:validation:Optional
	Git *GitWorkspaceConfig `json:"git,omitempty"`
}

// GitWorkspaceConfig defines git workspace settings
type GitWorkspaceConfig struct {
	// Default branch to clone from
	// +kubebuilder:default=main
	DefaultBranch string `json:"defaultBranch,omitempty"`

	// Prefix for created branches (e.g., "agent/feature/")
	BranchPrefix string `json:"branchPrefix,omitempty"`

	// Go template for commit messages
	CommitMessageTemplate string `json:"commitMessageTemplate,omitempty"`

	// Target path within repo for file operations
	TargetPath string `json:"targetPath,omitempty"`
}

// Hook defines a lifecycle action
type Hook struct {
	// Name of this hook instance (for logging/debugging)
	Name string `json:"name"`

	// Action to execute (e.g., git_clone, pr_create)
	// +kubebuilder:validation:Required
	Action string `json:"action"`

	// Condition template - hook runs only if this evaluates to true
	// +kubebuilder:validation:Optional
	Condition string `json:"condition,omitempty"`

	// Parameters for the action
	// +kubebuilder:validation:Optional
	Params map[string]string `json:"params,omitempty"`
}

// CriticConfig defines output validation settings
type CriticConfig struct {
	// Whether critic validation is enabled
	// +kubebuilder:default=false
	Enabled bool `json:"enabled"`

	// Critic mode: inline (same session) or subagent (separate agent)
	// +kubebuilder:validation:Enum=inline;subagent
	// +kubebuilder:default=inline
	Mode string `json:"mode,omitempty"`

	// Maximum retries if critic rejects output
	// +kubebuilder:validation:Minimum=0
	// +kubebuilder:validation:Maximum=5
	// +kubebuilder:default=2
	MaxRetries int `json:"maxRetries,omitempty"`

	// Inline critic configuration
	// +kubebuilder:validation:Optional
	Inline *InlineCriticConfig `json:"inline,omitempty"`

	// Subagent critic configuration
	// +kubebuilder:validation:Optional
	Subagent *SubagentCriticConfig `json:"subagent,omitempty"`
}

// InlineCriticConfig for same-session validation (SDK-agnostic)
type InlineCriticConfig struct {
	// Prompt template for the critic
	Prompt string `json:"prompt"`

	// Template condition that evaluates to true/false using critic result variables.
	// e.g., "{{.CriticApproved}}", "{{.TestsPassed}}", "{{.Score}} >= 0.8"
	// SDK-specific pass logic (regex pattern, JSON field, score threshold) goes in sdkConfig.
	// +kubebuilder:validation:Optional
	PassCondition string `json:"passCondition,omitempty"`

	// Whether to run tests as part of validation
	// +kubebuilder:default=false
	RunTests bool `json:"runTests,omitempty"`

	// Custom test command to run (e.g., "pytest -v tests/", "npm run test:ci")
	// If not specified, tries common test commands (pytest, npm test, go test, make test)
	// +kubebuilder:validation:Optional
	TestCommand string `json:"testCommand,omitempty"`

	// Timeout for test execution in seconds
	// +kubebuilder:validation:Minimum=10
	// +kubebuilder:validation:Maximum=3600
	// +kubebuilder:default=300
	TestTimeout int `json:"testTimeout,omitempty"`
}

// SubagentCriticConfig for separate agent validation
type SubagentCriticConfig struct {
	// Reference to the critic agent
	AgentRef AgentReference `json:"agentRef"`

	// Template for input to the critic agent
	InputTemplate string `json:"inputTemplate,omitempty"`

	// Condition template for passing (e.g., "{{.CriticScore}} >= 0.8")
	PassCondition string `json:"passCondition,omitempty"`
}

// AgentReference points to an Agent CRD
type AgentReference struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
}

// ExecutionProfileStatus defines observed state
type ExecutionProfileStatus struct {
	// Number of agents referencing this profile
	ReferenceCount int `json:"referenceCount,omitempty"`

	// Last validation timestamp
	LastValidated metav1.Time `json:"lastValidated,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Workspace",type=string,JSONPath=`.spec.workspace.type`
// +kubebuilder:printcolumn:name="Critic",type=boolean,JSONPath=`.spec.critic.enabled`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// ExecutionProfile defines a reusable, SDK-agnostic execution workflow
// Any executor (Claude SDK, OpenAI, LangGraph, etc.) can use these profiles
type ExecutionProfile struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ExecutionProfileSpec   `json:"spec,omitempty"`
	Status ExecutionProfileStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ExecutionProfileList contains a list of ExecutionProfile
type ExecutionProfileList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ExecutionProfile `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ExecutionProfile{}, &ExecutionProfileList{})
}
