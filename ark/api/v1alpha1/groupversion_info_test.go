/* Copyright 2025. McKinsey & Company */

package v1alpha1

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime"
)

func TestAddToSchemeRegistersTypes(t *testing.T) {
	s := runtime.NewScheme()
	if err := AddToScheme(s); err != nil {
		t.Fatalf("AddToScheme: %v", err)
	}

	for _, obj := range []runtime.Object{
		&Agent{}, &AgentList{},
		&Model{}, &ModelList{},
		&Team{}, &TeamList{},
		&Query{}, &QueryList{},
		&Tool{}, &ToolList{},
		&MCPServer{}, &MCPServerList{},
		&Memory{}, &MemoryList{},
		&ArkConfig{}, &ArkConfigList{},
		&A2ATask{}, &A2ATaskList{},
	} {
		if _, _, err := s.ObjectKinds(obj); err != nil {
			t.Errorf("type %T not registered in scheme: %v", obj, err)
		}
	}
}
