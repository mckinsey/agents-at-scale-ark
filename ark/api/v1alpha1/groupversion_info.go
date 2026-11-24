/* Copyright 2025. McKinsey & Company */

// Package v1alpha1 contains API Schema definitions for the ark v1alpha1 API group.
// +kubebuilder:object:generate=true
// +groupName=ark.mckinsey.com
// +versionName=v1alpha1
package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

var (
	GroupVersion  = schema.GroupVersion{Group: "ark.mckinsey.com", Version: "v1alpha1"}
	SchemeBuilder = runtime.NewSchemeBuilder(addKnownTypes)
	AddToScheme   = SchemeBuilder.AddToScheme
)

func addKnownTypes(s *runtime.Scheme) error {
	s.AddKnownTypes(
		GroupVersion,
		&Agent{}, &AgentList{},
		&Model{}, &ModelList{},
		&Team{}, &TeamList{},
		&Query{}, &QueryList{},
		&Tool{}, &ToolList{},
		&MCPServer{}, &MCPServerList{},
		&Memory{}, &MemoryList{},
		&ArkConfig{}, &ArkConfigList{},
		&A2ATask{}, &A2ATaskList{},
	)
	metav1.AddToGroupVersion(s, GroupVersion)
	return nil
}
