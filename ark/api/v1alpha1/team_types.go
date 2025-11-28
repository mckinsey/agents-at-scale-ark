/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type TeamMember struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type TeamSelectorSpec struct {
	Agent          string `json:"agent,omitempty"`
	SelectorPrompt string `json:"selectorPrompt,omitempty"`
}

type TeamGraphEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type TeamGraphSpec struct {
	Edges []TeamGraphEdge `json:"edges"`
}

type TeamSpec struct {
	Members     []TeamMember      `json:"members"`
	Strategy    string            `json:"strategy"`
	Description string            `json:"description,omitempty"`
	MaxTurns    *int              `json:"maxTurns,omitempty"`
	Selector    *TeamSelectorSpec `json:"selector,omitempty"`
	Graph       *TeamGraphSpec    `json:"graph,omitempty"`
}

type TeamStatus struct {
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Strategy",type=string,JSONPath=`.spec.strategy`
// +kubebuilder:printcolumn:name="Available",type=string,JSONPath=`.status.conditions[?(@.type=="Available")].status`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`
type Team struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   TeamSpec   `json:"spec,omitempty"`
	Status TeamStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true
type TeamList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Team `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Team{}, &TeamList{})
}
