package genai

import (
	"strings"
	"testing"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

func TestResolveModelSpec_NilModelSpec(t *testing.T) {
	_, _, err := ResolveModelSpec(nil, "default")
	if err == nil || !strings.Contains(err.Error(), "model spec is nil") {
		t.Errorf("expected 'model spec is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_NilAgentModelRefPointer(t *testing.T) {
	_, _, err := ResolveModelSpec((*arkv1alpha1.AgentModelRef)(nil), "default")
	if err == nil || !strings.Contains(err.Error(), "AgentModelRef pointer is nil") {
		t.Errorf("expected 'AgentModelRef pointer is nil' error, got: %v", err)
	}
}

func TestResolveModelSpec_ValidAgentModelRef(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{
		Name:      "my-model",
		Namespace: "custom-ns",
	}, "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != "custom-ns" {
		t.Errorf("got (%q, %q), want (my-model, custom-ns)", modelName, namespace)
	}
}

func TestResolveModelSpec_AgentModelRefUsesDefaultNamespace(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec(&arkv1alpha1.AgentModelRef{Name: "my-model"}, "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "my-model" || namespace != "default" {
		t.Errorf("got (%q, %q), want (my-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_StringModelSpec(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("string-model", "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "string-model" || namespace != "default" {
		t.Errorf("got (%q, %q), want (string-model, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_EmptyStringUsesDefaultModel(t *testing.T) {
	modelName, namespace, err := ResolveModelSpec("", "default")
	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if modelName != "default" || namespace != "default" {
		t.Errorf("got (%q, %q), want (default, default)", modelName, namespace)
	}
}

func TestResolveModelSpec_UnsupportedType(t *testing.T) {
	_, _, err := ResolveModelSpec(123, "default")
	if err == nil || !strings.Contains(err.Error(), "unsupported model spec type") {
		t.Errorf("expected 'unsupported model spec type' error, got: %v", err)
	}
}
