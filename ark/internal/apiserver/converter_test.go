/* Copyright 2025. McKinsey & Company */

package apiserver

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
)

func TestNewRegistryTypeConverter(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()
	if conv == nil {
		t.Fatal("expected non-nil converter")
	}
}

func TestRegistryTypeConverter_NewObject(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	tests := []struct {
		kind     string
		wantType runtime.Object
	}{
		{"Agent", &arkv1alpha1.Agent{}},
		{"Model", &arkv1alpha1.Model{}},
		{"Query", &arkv1alpha1.Query{}},
		{"Team", &arkv1alpha1.Team{}},
		{"Tool", &arkv1alpha1.Tool{}},
		{"Memory", &arkv1alpha1.Memory{}},
		{"MCPServer", &arkv1alpha1.MCPServer{}},
		{"Evaluation", &arkv1alpha1.Evaluation{}},
		{"Evaluator", &arkv1alpha1.Evaluator{}},
		{"A2ATask", &arkv1alpha1.A2ATask{}},
		{"A2AServer", &arkv1prealpha1.A2AServer{}},
		{"ExecutionEngine", &arkv1prealpha1.ExecutionEngine{}},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			obj := conv.NewObject(tt.kind)
			if obj == nil {
				t.Fatalf("NewObject(%q) = nil", tt.kind)
			}
		})
	}
}

func TestRegistryTypeConverter_NewObject_Unknown(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()
	obj := conv.NewObject("UnknownKind")
	if obj != nil {
		t.Errorf("expected nil for unknown kind, got %T", obj)
	}
}

func TestRegistryTypeConverter_NewListObject(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	tests := []struct {
		kind string
	}{
		{"Agent"},
		{"Model"},
		{"Query"},
		{"A2AServer"},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			obj := conv.NewListObject(tt.kind)
			if obj == nil {
				t.Fatalf("NewListObject(%q) = nil", tt.kind)
			}
		})
	}
}

func TestRegistryTypeConverter_NewListObject_Unknown(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()
	obj := conv.NewListObject("UnknownKind")
	if obj != nil {
		t.Errorf("expected nil for unknown kind, got %T", obj)
	}
}

func TestRegistryTypeConverter_Encode(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	agent := &arkv1alpha1.Agent{}
	agent.Name = "test-agent"
	agent.Namespace = "default"

	data, err := conv.Encode(agent)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}

	if len(data) == 0 {
		t.Error("expected non-empty data")
	}
}

func TestRegistryTypeConverter_Decode(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	jsonData := []byte(`{
		"apiVersion": "ark.mckinsey.com/v1alpha1",
		"kind": "Agent",
		"metadata": {
			"name": "test-agent",
			"namespace": "default"
		},
		"spec": {}
	}`)

	obj, err := conv.Decode("Agent", jsonData)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	agent, ok := obj.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", obj)
	}

	if agent.Name != "test-agent" {
		t.Errorf("expected name 'test-agent', got '%s'", agent.Name)
	}
}

func TestRegistryTypeConverter_Decode_Unknown(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()
	_, err := conv.Decode("UnknownKind", []byte(`{}`))
	if err == nil {
		t.Error("expected error for unknown kind")
	}
}

func TestRegistryTypeConverter_Decode_InvalidJSON(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()
	_, err := conv.Decode("Agent", []byte(`invalid json`))
	if err == nil {
		t.Error("expected error for invalid JSON")
	}
}

func TestRegistryTypeConverter_APIVersion(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	tests := []struct {
		kind     string
		expected string
	}{
		{"Agent", "ark.mckinsey.com/v1alpha1"},
		{"Model", "ark.mckinsey.com/v1alpha1"},
		{"Query", "ark.mckinsey.com/v1alpha1"},
		{"A2AServer", "ark.mckinsey.com/v1prealpha1"},
		{"ExecutionEngine", "ark.mckinsey.com/v1prealpha1"},
		{"UnknownKind", "ark.mckinsey.com/v1alpha1"},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			got := conv.APIVersion(tt.kind)
			if got != tt.expected {
				t.Errorf("APIVersion(%q) = %q, want %q", tt.kind, got, tt.expected)
			}
		})
	}
}

func TestRegistryTypeConverter_RoundTrip(t *testing.T) {
	t.Parallel()
	conv := NewRegistryTypeConverter()

	agent := &arkv1alpha1.Agent{}
	agent.Name = "roundtrip-agent"
	agent.Namespace = "test-ns"
	agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{Name: "test-model"}

	data, err := conv.Encode(agent)
	if err != nil {
		t.Fatalf("Encode() error = %v", err)
	}

	decoded, err := conv.Decode("Agent", data)
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	decodedAgent, ok := decoded.(*arkv1alpha1.Agent)
	if !ok {
		t.Fatalf("expected *Agent, got %T", decoded)
	}

	if decodedAgent.Name != agent.Name {
		t.Errorf("name mismatch: got %q, want %q", decodedAgent.Name, agent.Name)
	}
	if decodedAgent.Namespace != agent.Namespace {
		t.Errorf("namespace mismatch: got %q, want %q", decodedAgent.Namespace, agent.Namespace)
	}
}
