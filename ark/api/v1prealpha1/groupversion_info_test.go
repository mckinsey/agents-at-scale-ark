/* Copyright 2025. McKinsey & Company */

package v1prealpha1

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
		&ExecutionEngine{}, &ExecutionEngineList{},
		&A2AServer{}, &A2AServerList{},
	} {
		if _, _, err := s.ObjectKinds(obj); err != nil {
			t.Errorf("type %T not registered in scheme: %v", obj, err)
		}
	}
}
