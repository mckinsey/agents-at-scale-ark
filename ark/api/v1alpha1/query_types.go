/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type QueryTarget struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=agent;team;model;tool
	Type string `json:"type"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
}

type MemoryRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

type EvaluatorRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

type QuerySpec struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Input string `json:"input"`
	// +kubebuilder:validation:Optional
	// Parameters for template processing in the input field
	Parameters []Parameter `json:"parameters,omitempty"`
	// +kubebuilder:validation:Optional
	Targets []QueryTarget `json:"targets,omitempty"`
	// +kubebuilder:validation:Optional
	Selector *metav1.LabelSelector `json:"selector,omitempty"`
	// +kubebuilder:validation:Optional
	Memory *MemoryRef `json:"memory,omitempty"`
	// +kubebuilder:validation:Optional
	Evaluators []EvaluatorRef `json:"evaluators,omitempty"`
	// +kubebuilder:validation:Optional
	EvaluatorSelector *metav1.LabelSelector `json:"evaluatorSelector,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	ServiceAccount string `json:"serviceAccount,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:MinLength=1
	SessionId string `json:"sessionId,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="720h"
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// +kubebuilder:default="5m"
	// Timeout for query execution (e.g., "30s", "5m", "1h")
	Timeout *metav1.Duration `json:"timeout,omitempty"`
	// +kubebuilder:validation:Optional
	// When true, indicates intent to cancel the query
	Cancel bool `json:"cancel,omitempty"`
}

// Response defines a response from a query target.
type Response struct {
	Target  QueryTarget `json:"target,omitempty"`
	Content string      `json:"content,omitempty"`
	Raw     string      `json:"raw,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Duration",type=string,JSONPath=`.status.duration`
// +kubebuilder:printcolumn:name="Evaluations",type=integer,JSONPath=`.status.evaluations.length`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type Query struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   QuerySpec   `json:"spec,omitempty"`
	Status QueryStatus `json:"status,omitempty"`
}

type EvaluationResult struct {
	EvaluatorName string            `json:"evaluatorName,omitempty"`
	Score         string            `json:"score,omitempty"`
	Passed        bool              `json:"passed,omitempty"`
	Metadata      map[string]string `json:"metadata,omitempty"`
}

type TokenUsage struct {
	PromptTokens     int64 `json:"promptTokens,omitempty"`
	CompletionTokens int64 `json:"completionTokens,omitempty"`
	TotalTokens      int64 `json:"totalTokens,omitempty"`
}

type QueryStatus struct {
	// +kubebuilder:default="pending"
	// +kubebuilder:validation:Enum=pending;running;evaluating;error;done;canceled
	Phase       string             `json:"phase,omitempty"`
	Responses   []Response         `json:"responses,omitempty"`
	Evaluations []EvaluationResult `json:"evaluations,omitempty"`
	TokenUsage  TokenUsage         `json:"tokenUsage,omitempty"`
	// +kubebuilder:validation:Optional
	Duration *metav1.Duration `json:"duration,omitempty"`
}

// +kubebuilder:object:root=true
type QueryList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Query `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Query{}, &QueryList{})
}
