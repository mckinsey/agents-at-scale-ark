/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type EvaluationConditionType string

// Evaluation condition types
const (
	// EvaluationCompleted indicates that the evaluation has finished (regardless of outcome)
	EvaluationCompleted EvaluationConditionType = "Completed"
)

// EvaluationEvaluatorRef references an evaluator resource for evaluation with parameters
type EvaluationEvaluatorRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
	// +kubebuilder:validation:Optional
	Parameters []Parameter `json:"parameters,omitempty"`
}

// QueryRef references a query for post-hoc evaluation
type QueryRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
	// +kubebuilder:validation:Optional
	// Target name to match against query responses (e.g., "weather-agent", "summary-team")
	ResponseTarget string `json:"responseTarget,omitempty"`
}

// EvaluationConfig holds type-specific configuration parameters
// +kubebuilder:validation:Type=object
type EvaluationConfig struct {
	// +kubebuilder:validation:Optional
	*DirectEvaluationConfig `json:",inline"`
	// +kubebuilder:validation:Optional
	*QueryBasedEvaluationConfig `json:",inline"`
	// +kubebuilder:validation:Optional
	*BatchEvaluationConfig `json:",inline"`
	// +kubebuilder:validation:Optional
	*BaselineEvaluationConfig `json:",inline"`
	// +kubebuilder:validation:Optional
	*EventEvaluationConfig `json:",inline"`
}

// DirectEvaluationConfig contains Direct Evaluation specific parameters
type DirectEvaluationConfig struct {
	// +kubebuilder:validation:Optional
	Input string `json:"input,omitempty"`
	// +kubebuilder:validation:Optional
	Output string `json:"output,omitempty"`
}

// QueryBasedEvaluationConfig contains Query related Evaluation specific parameters
type QueryBasedEvaluationConfig struct {
	// +kubebuilder:validation:Optional
	QueryRef *QueryRef `json:"queryRef,omitempty"`
}

// EvaluationRef references an evaluation to aggregate in batch type
type EvaluationRef struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:MinLength=1
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	Namespace string `json:"namespace,omitempty"`
}

// BatchEvaluationItem defines individual evaluation to create in batch mode
type BatchEvaluationItem struct {
	// +kubebuilder:validation:Optional
	// Name for the child evaluation (auto-generated if empty)
	Name string `json:"name,omitempty"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=direct;query;baseline;event
	Type string `json:"type"`
	// +kubebuilder:validation:Required
	// Configuration for this specific evaluation
	// +kubebuilder:validation:Type=object
	Config EvaluationConfig `json:"config"`
	// +kubebuilder:validation:Required
	// Evaluator reference for this evaluation
	Evaluator EvaluationEvaluatorRef `json:"evaluator"`
	// +kubebuilder:validation:Optional
	// TTL override for this evaluation
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// +kubebuilder:validation:Optional
	// Timeout override for this evaluation
	Timeout *metav1.Duration `json:"timeout,omitempty"`
}

// BatchEvaluationTemplate defines default template for dynamic evaluation creation
type BatchEvaluationTemplate struct {
	// +kubebuilder:validation:Optional
	// Name prefix for generated child evaluations (defaults to parent name)
	NamePrefix string `json:"namePrefix,omitempty"`
	// +kubebuilder:validation:Required
	// Default evaluator reference for template-generated evaluations
	Evaluator EvaluationEvaluatorRef `json:"evaluator"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Enum=direct;query;baseline;event
	Type string `json:"type"`
	// +kubebuilder:validation:Required
	// Default configuration for template-generated evaluations
	// +kubebuilder:validation:Type=object
	Config EvaluationConfig `json:"config"`
	// +kubebuilder:validation:Optional
	// Default parameters for template-generated evaluations
	Parameters []Parameter `json:"parameters,omitempty"`
}

// QuerySelector selects queries based on labels and fields
type QuerySelector struct {
	// +kubebuilder:validation:Optional
	// Label selector
	MatchLabels map[string]string `json:"matchLabels,omitempty"`
	// +kubebuilder:validation:Optional
	// Field selector expressions
	MatchExpressions []metav1.LabelSelectorRequirement `json:"matchExpressions,omitempty"`
}

// BatchEvaluationConfig contains Batch Evaluation specific parameters
type BatchEvaluationConfig struct {
	// +kubebuilder:validation:Optional
	// List of specific evaluations to create (explicit definitions)
	Items []BatchEvaluationItem `json:"items,omitempty"`
	// +kubebuilder:validation:Optional
	// Template for dynamically creating evaluations from query selectors
	Template *BatchEvaluationTemplate `json:"template,omitempty"`
	// +kubebuilder:validation:Optional
	// Query selector for dynamic evaluation creation (requires template)
	QuerySelector *QuerySelector `json:"querySelector,omitempty"`
	// +kubebuilder:validation:Optional
	// List of existing evaluations to aggregate (legacy support)
	Evaluations []EvaluationRef `json:"evaluations,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=10
	// Maximum number of concurrent child evaluations
	Concurrency int32 `json:"concurrency,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=false
	// Whether to continue on child evaluation failures
	ContinueOnFailure bool `json:"continueOnFailure,omitempty"`
}

// BaselineEvaluationConfig contains Baseline Evaluation specific parameters
type BaselineEvaluationConfig struct{}

// EventEvaluationConfig, expression based evaluations, especially for tools
type EventEvaluationConfig struct {
	// +kubebuilder:validation:Optional
	Rules []ExpressionRule `json:"rules,omitempty"`
}

// EvaluationSpec defines the desired state of Evaluation
type EvaluationSpec struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=direct;baseline;query;batch;event
	// +kubebuilder:default=direct
	Type string `json:"type,omitempty"`
	// +kubebuilder:validation:Required
	Config EvaluationConfig `json:"config"`
	// +kubebuilder:validation:Optional
	Evaluator EvaluationEvaluatorRef `json:"evaluator,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:default="720h"
	TTL *metav1.Duration `json:"ttl,omitempty"`
	// +kubebuilder:default="5m"
	// Timeout for query execution (e.g., "30s", "5m", "1h")
	Timeout *metav1.Duration `json:"timeout,omitempty"`
}

// BatchEvaluationProgress tracks progress of batch evaluations
type BatchEvaluationProgress struct {
	// +kubebuilder:validation:Optional
	// Total number of child evaluations created
	Total int32 `json:"total,omitempty"`
	// +kubebuilder:validation:Optional
	// Number of child evaluations completed
	Completed int32 `json:"completed,omitempty"`
	// +kubebuilder:validation:Optional
	// Number of child evaluations that failed
	Failed int32 `json:"failed,omitempty"`
	// +kubebuilder:validation:Optional
	// Number of child evaluations currently running
	Running int32 `json:"running,omitempty"`
	// +kubebuilder:validation:Optional
	// List of child evaluation names and their status
	ChildEvaluations []ChildEvaluationStatus `json:"childEvaluations,omitempty"`
}

// ChildEvaluationStatus represents the status of a child evaluation
type ChildEvaluationStatus struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=pending;running;error;done;canceled
	Phase string `json:"phase,omitempty"`
	// +kubebuilder:validation:Optional
	Score string `json:"score,omitempty"`
	// +kubebuilder:validation:Optional
	Passed bool `json:"passed"`
	// +kubebuilder:validation:Optional
	Message string `json:"message,omitempty"`
}

// EvaluationStatus defines the observed state of Evaluation
type EvaluationStatus struct {
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Enum=pending;running;error;done;canceled
	Phase string `json:"phase,omitempty"`
	// +kubebuilder:validation:Optional
	Message string `json:"message,omitempty"`
	// +kubebuilder:validation:Optional
	// +kubebuilder:validation:Pattern=^(0(\.[0-9]+)?|1(\.0+)?)$
	Score string `json:"score,omitempty"`
	// +kubebuilder:validation:Optional
	Passed bool `json:"passed"`
	// +kubebuilder:validation:Optional
	TokenUsage *TokenUsage `json:"tokenUsage,omitempty"`
	// +kubebuilder:validation:Optional
	Duration *metav1.Duration `json:"duration,omitempty"`
	// +kubebuilder:validation:Optional
	// Batch evaluation progress (only set for batch type evaluations)
	BatchProgress *BatchEvaluationProgress `json:"batchProgress,omitempty"`
	// +kubebuilder:validation:Optional
	// Conditions represent the latest available observations of an evaluation's state
	Conditions []metav1.Condition `json:"conditions,omitempty" patchStrategy:"merge" patchMergeKey:"type"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Type",type=string,JSONPath=`.spec.type`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Score",type=string,JSONPath=`.status.score`
// +kubebuilder:printcolumn:name="Passed",type=boolean,JSONPath=`.status.passed`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

type Evaluation struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   EvaluationSpec   `json:"spec,omitempty"`
	Status EvaluationStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// EvaluationList contains a list of Evaluation
type EvaluationList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Evaluation `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Evaluation{}, &EvaluationList{})
}
