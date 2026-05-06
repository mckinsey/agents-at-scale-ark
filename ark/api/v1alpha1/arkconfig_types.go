/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ArkConfigSpec defines cluster-wide Ark defaults. The singleton
// object named "default" is consulted by admission webhooks when
// a Query is created without an explicit ttl.
type ArkConfigSpec struct {
	// QueryTTL is the default TTL injected into Query resources
	// that do not specify spec.ttl. If unset, the hardcoded
	// fallback of 720h is used.
	// +kubebuilder:validation:Optional
	QueryTTL *metav1.Duration `json:"queryTTL,omitempty"`
}

// ArkConfigStatus is reserved for future status reporting. Currently empty.
type ArkConfigStatus struct{}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Cluster
// +kubebuilder:printcolumn:name="QueryTTL",type=string,JSONPath=`.spec.queryTTL`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// ArkConfig is the Schema for cluster-wide Ark defaults.
type ArkConfig struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ArkConfigSpec   `json:"spec,omitempty"`
	Status ArkConfigStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// ArkConfigList contains a list of ArkConfig.
type ArkConfigList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ArkConfig `json:"items"`
}

func init() {
	SchemeBuilder.Register(&ArkConfig{}, &ArkConfigList{})
}
