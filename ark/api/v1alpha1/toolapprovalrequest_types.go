/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ToolCallAnnotations contains tool hints that help inform approval decisions.
type ToolCallAnnotations struct {
	// +kubebuilder:validation:Optional
	DestructiveHint bool `json:"destructiveHint,omitempty"`
	// +kubebuilder:validation:Optional
	ReadOnlyHint bool `json:"readOnlyHint,omitempty"`
	// +kubebuilder:validation:Optional
	IdempotentHint bool `json:"idempotentHint,omitempty"`
	// +kubebuilder:validation:Optional
	OpenWorldHint bool `json:"openWorldHint,omitempty"`
}

// ToolCallInfo contains information about a tool call pending approval.
type ToolCallInfo struct {
	// +kubebuilder:validation:Required
	// ID is the unique identifier for this tool call
	ID string `json:"id"`
	// +kubebuilder:validation:Required
	// Name is the tool name
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	// Type is the tool type (http, mcp, agent, etc.)
	Type string `json:"type"`
	// +kubebuilder:validation:Required
	// Arguments is the JSON-serialized arguments for the tool call
	Arguments string `json:"arguments"`
	// +kubebuilder:validation:Optional
	// Description is the tool description to help approvers understand what the tool does
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	// Annotations contains tool hints (destructive, read-only, etc.)
	Annotations *ToolCallAnnotations `json:"annotations,omitempty"`
	// +kubebuilder:validation:Optional
	// AgentReasoning is the model's explanation for why it's calling this tool
	AgentReasoning string `json:"agentReasoning,omitempty"`
}

// ExecutionContext contains the serialized state needed to resume execution after approval.
type ExecutionContext struct {
	// +kubebuilder:validation:Required
	// ConversationHistory is the base64-encoded message array
	ConversationHistory string `json:"conversationHistory"`
	// +kubebuilder:validation:Required
	// PendingToolCallIndex is the index of the first tool call awaiting approval
	PendingToolCallIndex int `json:"pendingToolCallIndex"`
	// +kubebuilder:validation:Optional
	// CompletedToolResults contains results of tools that executed before the approval pause
	CompletedToolResults []string `json:"completedToolResults,omitempty"`
	// +kubebuilder:validation:Required
	// AgentName is the name of the agent being executed
	AgentName string `json:"agentName"`
	// +kubebuilder:validation:Required
	// AgentNamespace is the namespace of the agent
	AgentNamespace string `json:"agentNamespace"`
}

// QueryReference references the Query that triggered this approval request.
type QueryReference struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Namespace string `json:"namespace"`
}

// ClientContext contains information about the client that submitted the decision.
type ClientContext struct {
	// +kubebuilder:validation:Optional
	IPAddress string `json:"ipAddress,omitempty"`
	// +kubebuilder:validation:Optional
	UserAgent string `json:"userAgent,omitempty"`
}

// ApprovalDecision contains information about the approval decision.
type ApprovalDecision struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=approved;rejected
	Action string `json:"action"`
	// +kubebuilder:validation:Required
	DecidedBy string `json:"decidedBy"`
	// +kubebuilder:validation:Required
	DecidedAt metav1.Time `json:"decidedAt"`
	// +kubebuilder:validation:Optional
	Reason string `json:"reason,omitempty"`
	// +kubebuilder:validation:Optional
	ClientContext *ClientContext `json:"clientContext,omitempty"`
}

// ToolApprovalRequestSpec defines the desired state of ToolApprovalRequest.
type ToolApprovalRequestSpec struct {
	// +kubebuilder:validation:Required
	// QueryRef references the Query that triggered this approval request
	QueryRef QueryReference `json:"queryRef"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinItems=1
	// ToolCalls contains the tool calls pending approval
	ToolCalls []ToolCallInfo `json:"toolCalls"`
	// +kubebuilder:validation:Optional
	// Timeout is the duration to wait for approval before taking the onTimeout action
	Timeout *metav1.Duration `json:"timeout,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=reject;proceed
	// +kubebuilder:default=reject
	// OnTimeout specifies what to do when approval times out
	OnTimeout string `json:"onTimeout,omitempty"`
	// +kubebuilder:validation:Optional
	// Approvers specifies who can approve this request
	Approvers []ApproverRef `json:"approvers,omitempty"`
	// +kubebuilder:validation:Optional
	// ReasonRequired specifies whether a reason must be provided when rejecting
	ReasonRequired bool `json:"reasonRequired,omitempty"`
	// +kubebuilder:validation:Required
	// ExecutionContext contains the state needed to resume execution after approval
	ExecutionContext ExecutionContext `json:"executionContext"`
}

// ToolApprovalRequestStatus defines the observed state of ToolApprovalRequest.
type ToolApprovalRequestStatus struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=pending;approved;rejected;expired
	// +kubebuilder:default=pending
	Phase string `json:"phase,omitempty"`
	// +kubebuilder:validation:Optional
	// ObservedGeneration is used for optimistic locking
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
	// +kubebuilder:validation:Optional
	// RequestedAt is when the approval request was created
	RequestedAt *metav1.Time `json:"requestedAt,omitempty"`
	// +kubebuilder:validation:Optional
	// Decision contains the approval decision details
	Decision *ApprovalDecision `json:"decision,omitempty"`
	// +kubebuilder:validation:Optional
	// ApprovalDuration is the time between request and decision
	ApprovalDuration *metav1.Duration `json:"approvalDuration,omitempty"`
	// +kubebuilder:validation:Optional
	// Conditions represent the latest available observations
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Query",type=string,JSONPath=`.spec.queryRef.name`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Tools",type=integer,JSONPath=`.spec.toolCalls[*].name`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`
// +kubebuilder:resource:shortName=tar

// ToolApprovalRequest represents a pending human approval for one or more tool calls.
type ToolApprovalRequest struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ToolApprovalRequestSpec   `json:"spec,omitempty"`
	Status ToolApprovalRequestStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ToolApprovalRequestList contains a list of ToolApprovalRequest.
type ToolApprovalRequestList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ToolApprovalRequest `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ToolApprovalRequest{}, &ToolApprovalRequestList{})
}
