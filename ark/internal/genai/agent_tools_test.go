package genai

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/telemetry/noop"
)

func setupTestClientForTools(objects []client.Object) client.Client {
	scheme := runtime.NewScheme()
	_ = arkv1alpha1.AddToScheme(scheme)

	return fake.NewClientBuilder().
		WithScheme(scheme).
		WithObjects(objects...).
		Build()
}

func TestRegisterToolDescriptionOverride(t *testing.T) {
	tests := []struct {
		name                 string
		toolDescription      string
		agentToolDescription string
		expectedDescription  string
		shouldOverride       bool
	}{
		{
			name:                 "agent tool description overrides tool description",
			toolDescription:      "Original tool description",
			agentToolDescription: "Custom description for this agent",
			expectedDescription:  "Custom description for this agent",
			shouldOverride:       true,
		},
		{
			name:                 "empty agent tool description uses tool description",
			toolDescription:      "Original tool description",
			agentToolDescription: "",
			expectedDescription:  "Original tool description",
			shouldOverride:       false,
		},
		{
			name:                 "agent tool description overrides empty tool description",
			toolDescription:      "",
			agentToolDescription: "Custom description for this agent",
			expectedDescription:  "Custom description for this agent",
			shouldOverride:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()

			// Create a test tool using "noop" builtin
			tool := &arkv1alpha1.Tool{
				ObjectMeta: metav1.ObjectMeta{
					Name:      "noop",
					Namespace: "default",
				},
				Spec: arkv1alpha1.ToolSpec{
					Type:        ToolTypeBuiltin,
					Description: tt.toolDescription,
				},
			}

			// Setup k8s client with the tool
			k8sClient := setupTestClientForTools([]client.Object{tool})

			// Create agent tool with optional description override
			agentTool := arkv1alpha1.AgentTool{
				Type:        "built-in",
				Name:        "noop",
				Description: tt.agentToolDescription,
			}

			// Create tool registry
			telemetryProvider := noop.NewProvider()
			eventingProvider := eventnoop.NewProvider()
			registry := NewToolRegistry(nil, telemetryProvider.ToolRecorder(), eventingProvider.ToolRecorder())

			// Register the tool
			err := registry.registerTool(ctx, k8sClient, agentTool, "default", telemetryProvider, eventingProvider)
			require.NoError(t, err)

			// Verify the tool was registered with correct description
			definitions := registry.GetToolDefinitions()
			require.Len(t, definitions, 1)
			require.Equal(t, tt.expectedDescription, definitions[0].Description)
		})
	}
}

func TestRegisterToolDescriptionWithPartial(t *testing.T) {
	ctx := context.Background()

	// Create input schema as RawExtension
	inputSchema := map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"city": map[string]interface{}{
				"type":        "string",
				"description": "City name",
			},
			"units": map[string]interface{}{
				"type":        "string",
				"description": "Temperature units",
			},
		},
		"required": []interface{}{"city"},
	}
	inputSchemaBytes, err := json.Marshal(inputSchema)
	require.NoError(t, err)

	// Create a test tool using "noop" builtin
	tool := &arkv1alpha1.Tool{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "noop",
			Namespace: "default",
		},
		Spec: arkv1alpha1.ToolSpec{
			Type:        ToolTypeBuiltin,
			Description: "Full weather API with all parameters",
			InputSchema: &runtime.RawExtension{Raw: inputSchemaBytes},
		},
	}

	// Setup k8s client with the tool
	k8sClient := setupTestClientForTools([]client.Object{tool})

	// Create agent tool with both description override and partial parameters
	agentTool := arkv1alpha1.AgentTool{
		Type:        "built-in",
		Name:        "non-existent-name", // Will be overridden by partial
		Description: "Get weather by city name only",
		Partial: &arkv1alpha1.ToolPartial{
			Name: "noop",
			Parameters: []arkv1alpha1.ToolFunction{
				{
					Name:  "units",
					Value: "metric",
				},
			},
		},
	}

	// Create tool registry
	telemetryProvider := noop.NewProvider()
	eventingProvider := eventnoop.NewProvider()
	registry := NewToolRegistry(nil, telemetryProvider.ToolRecorder(), eventingProvider.ToolRecorder())

	// Register the tool
	err = registry.registerTool(ctx, k8sClient, agentTool, "default", telemetryProvider, eventingProvider)
	require.NoError(t, err)

	// Verify the tool was registered with correct description and name
	definitions := registry.GetToolDefinitions()
	require.Len(t, definitions, 1)
	require.Equal(t, "Get weather by city name only", definitions[0].Description, "Description should be overridden")
	require.Equal(t, "noop", definitions[0].Name, "Name should be overridden by partial")
}

func TestCreatePartialToolDefinitionPreservesDescription(t *testing.T) {
	// Test that CreatePartialToolDefinition preserves the tool description
	originalTool := ToolDefinition{
		Name:        "original-tool",
		Description: "Original tool description",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"city": map[string]any{
					"type":        "string",
					"description": "City name",
				},
				"units": map[string]any{
					"type":        "string",
					"description": "Temperature units",
				},
			},
			"required": []any{"city"},
		},
	}

	partial := &arkv1alpha1.ToolPartial{
		Name: "weather-forecast",
		Parameters: []arkv1alpha1.ToolFunction{
			{
				Name:  "units",
				Value: "metric",
			},
		},
	}

	result, err := CreatePartialToolDefinition(originalTool, partial)
	require.NoError(t, err)
	require.Equal(t, "weather-forecast", result.Name, "Name should be overridden by partial")
	require.Equal(t, "Original tool description", result.Description, "Description should be preserved from original tool")

	// Verify units parameter was removed from schema
	props, ok := result.Parameters["properties"].(map[string]any)
	require.True(t, ok)
	_, hasUnits := props["units"]
	require.False(t, hasUnits, "units parameter should be removed from schema")
	_, hasCity := props["city"]
	require.True(t, hasCity, "city parameter should remain in schema")
}
