/* Copyright 2025. McKinsey & Company */

// Package v1prealpha1 contains API Schema definitions for the ark v1prealpha1 API group.
// +kubebuilder:object:generate=true
// +groupName=ark.mckinsey.com
package v1prealpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	GroupVersion  = schema.GroupVersion{Group: "ark.mckinsey.com", Version: "v1prealpha1"}
	SchemeBuilder = runtime.NewSchemeBuilder(addKnownTypes)
	AddToScheme   = SchemeBuilder.AddToScheme
)

func addKnownTypes(s *runtime.Scheme) error {
	s.AddKnownTypes(
		GroupVersion,
		&ExecutionEngine{}, &ExecutionEngineList{},
		&A2AServer{}, &A2AServerList{},
	)
	metav1.AddToGroupVersion(s, GroupVersion)
	return nil
}
