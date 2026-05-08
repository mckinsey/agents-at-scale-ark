/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

type InteractionType string

const (
	InteractionTypeApproval     InteractionType = "approval"
	InteractionTypeInput        InteractionType = "input"
	InteractionTypeSelection    InteractionType = "selection"
	InteractionTypeConfirmation InteractionType = "confirmation"
)

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

type ToolCallInfo struct {
	// +kubebuilder:validation:Required
	ID string `json:"id"`
	// +kubebuilder:validation:Required
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Type string `json:"type"`
	// +kubebuilder:validation:Required
	Arguments string `json:"arguments"`
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
	// +kubebuilder:validation:Optional
	Annotations *ToolCallAnnotations `json:"annotations,omitempty"`
	// +kubebuilder:validation:Optional
	AgentReasoning string `json:"agentReasoning,omitempty"`
}

type ExecutionContext struct {
	// +kubebuilder:validation:Required
	ConversationHistory string `json:"conversationHistory"`
	// +kubebuilder:validation:Required
	PendingToolCallIndex int `json:"pendingToolCallIndex"`
	// +kubebuilder:validation:Optional
	CompletedToolResults []string `json:"completedToolResults,omitempty"`
	// +kubebuilder:validation:Required
	AgentName string `json:"agentName"`
	// +kubebuilder:validation:Required
	AgentNamespace string `json:"agentNamespace"`
}

type QueryReference struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Namespace string `json:"namespace"`
}

type ClientContext struct {
	// +kubebuilder:validation:Optional
	IPAddress string `json:"ipAddress,omitempty"`
	// +kubebuilder:validation:Optional
	UserAgent string `json:"userAgent,omitempty"`
}

type ApprovalConfig struct {
	// +kubebuilder:validation:Optional
	Approvers []ApproverRef `json:"approvers,omitempty"`
	// +kubebuilder:validation:Optional
	ReasonRequired bool `json:"reasonRequired,omitempty"`
}

type SelectionOption struct {
	// +kubebuilder:validation:Required
	Value string `json:"value"`
	// +kubebuilder:validation:Required
	Label string `json:"label"`
	// +kubebuilder:validation:Optional
	Description string `json:"description,omitempty"`
}

type InputConfig struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Schemaless
	Schema *runtime.RawExtension `json:"schema,omitempty"`
	// +kubebuilder:validation:Optional
	Prompt string `json:"prompt,omitempty"`
}

type SelectionConfig struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinItems=1
	Options []SelectionOption `json:"options"`
	// +kubebuilder:validation:Optional
	MultiSelect bool `json:"multiSelect,omitempty"`
	// +kubebuilder:validation:Optional
	Prompt string `json:"prompt,omitempty"`
}

type ConfirmationConfig struct {
	// +kubebuilder:validation:Optional
	AllowEdit bool `json:"allowEdit,omitempty"`
	// +kubebuilder:validation:Optional
	Message string `json:"message,omitempty"`
}

type ApprovalResponse struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=approved;rejected
	Action string `json:"action"`
	// +kubebuilder:validation:Optional
	Reason string `json:"reason,omitempty"`
}

type InputResponse struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:pruning:PreserveUnknownFields
	// +kubebuilder:validation:Schemaless
	Data *runtime.RawExtension `json:"data,omitempty"`
}

type SelectionResponse struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinItems=1
	Selected []string `json:"selected"`
}

type ConfirmationResponse struct {
	// +kubebuilder:validation:Required
	Confirmed bool `json:"confirmed"`
	// +kubebuilder:validation:Optional
	ModifiedArguments string `json:"modifiedArguments,omitempty"`
}

type InteractionResponse struct {
	// +kubebuilder:validation:Required
	RespondedBy string `json:"respondedBy"`
	// +kubebuilder:validation:Required
	RespondedAt metav1.Time `json:"respondedAt"`
	// +kubebuilder:validation:Optional
	ClientContext *ClientContext `json:"clientContext,omitempty"`
	// +kubebuilder:validation:Optional
	Approval *ApprovalResponse `json:"approval,omitempty"`
	// +kubebuilder:validation:Optional
	Input *InputResponse `json:"input,omitempty"`
	// +kubebuilder:validation:Optional
	Selection *SelectionResponse `json:"selection,omitempty"`
	// +kubebuilder:validation:Optional
	Confirmation *ConfirmationResponse `json:"confirmation,omitempty"`
}

type ToolInteractionSpec struct {
	// +kubebuilder:validation:Required
	QueryRef QueryReference `json:"queryRef"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=approval;input;selection;confirmation
	Type InteractionType `json:"type"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinItems=1
	ToolCalls []ToolCallInfo `json:"toolCalls"`
	// +kubebuilder:validation:Optional
	Timeout *metav1.Duration `json:"timeout,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=reject;proceed
	// +kubebuilder:default=reject
	OnTimeout string `json:"onTimeout,omitempty"`
	// +kubebuilder:validation:Optional
	Approval *ApprovalConfig `json:"approval,omitempty"`
	// +kubebuilder:validation:Optional
	Input *InputConfig `json:"input,omitempty"`
	// +kubebuilder:validation:Optional
	Selection *SelectionConfig `json:"selection,omitempty"`
	// +kubebuilder:validation:Optional
	Confirmation *ConfirmationConfig `json:"confirmation,omitempty"`
	// +kubebuilder:validation:Required
	ExecutionContext ExecutionContext `json:"executionContext"`
}

type ToolInteractionStatus struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=pending;completed;rejected;expired
	// +kubebuilder:default=pending
	Phase string `json:"phase,omitempty"`
	// +kubebuilder:validation:Optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
	// +kubebuilder:validation:Optional
	RequestedAt *metav1.Time `json:"requestedAt,omitempty"`
	// +kubebuilder:validation:Optional
	Response *InteractionResponse `json:"response,omitempty"`
	// +kubebuilder:validation:Optional
	ResponseDuration *metav1.Duration `json:"responseDuration,omitempty"`
	// +kubebuilder:validation:Optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Query",type=string,JSONPath=`.spec.queryRef.name`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`
// +kubebuilder:resource:shortName=ti

type ToolInteraction struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ToolInteractionSpec   `json:"spec,omitempty"`
	Status ToolInteractionStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

type ToolInteractionList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ToolInteraction `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ToolInteraction{}, &ToolInteractionList{})
}
