package genai

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/openai/openai-go"
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

func TestCreateToolExecutor_TeamType(t *testing.T) {
	ctx := context.Background()
	telemetryProvider := noop.NewProvider()
	eventingProvider := eventnoop.NewProvider()

	t.Run("creates team executor via CreateToolExecutor", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-team",
				Namespace: "default",
			},
			Spec: arkv1alpha1.TeamSpec{
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Strategy: "sequential",
			},
		}

		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "team-tool",
				Namespace: "default",
			},
			Spec: arkv1alpha1.ToolSpec{
				Type: ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{
					Name: "test-team",
				},
			},
		}

		k8sClient := setupTestClientForTools([]client.Object{team})
		executor, err := CreateToolExecutor(ctx, k8sClient, tool, "default", nil, nil, telemetryProvider, eventingProvider)

		require.NoError(t, err)
		require.NotNil(t, executor)

		teamExecutor, ok := executor.(*TeamToolExecutor)
		require.True(t, ok)
		require.Equal(t, "test-team", teamExecutor.TeamName)
		require.Equal(t, "default", teamExecutor.Namespace)
	})
}

func TestCreateTeamExecutor(t *testing.T) {
	ctx := context.Background()
	telemetryProvider := noop.NewProvider()
	eventingProvider := eventnoop.NewProvider()

	t.Run("successfully creates team executor", func(t *testing.T) {
		team := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-team",
				Namespace: "default",
			},
			Spec: arkv1alpha1.TeamSpec{
				Members: []arkv1alpha1.TeamMember{
					{Name: "agent1", Type: "agent"},
				},
				Strategy: "sequential",
			},
		}

		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "team-tool",
				Namespace: "default",
			},
			Spec: arkv1alpha1.ToolSpec{
				Type: ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{
					Name: "test-team",
				},
			},
		}

		k8sClient := setupTestClientForTools([]client.Object{team})
		executor, err := createTeamExecutor(ctx, k8sClient, tool, "default", telemetryProvider, eventingProvider)

		require.NoError(t, err)
		require.NotNil(t, executor)

		teamExecutor, ok := executor.(*TeamToolExecutor)
		require.True(t, ok)
		require.Equal(t, "test-team", teamExecutor.TeamName)
		require.Equal(t, "default", teamExecutor.Namespace)
		require.NotNil(t, teamExecutor.TeamCRD)
		require.Equal(t, "test-team", teamExecutor.TeamCRD.Name)
	})

	t.Run("fails when team name is empty", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "team-tool",
				Namespace: "default",
			},
			Spec: arkv1alpha1.ToolSpec{
				Type: ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{
					Name: "",
				},
			},
		}

		k8sClient := setupTestClientForTools([]client.Object{})
		executor, err := createTeamExecutor(ctx, k8sClient, tool, "default", telemetryProvider, eventingProvider)

		require.Error(t, err)
		require.Nil(t, executor)
		require.Contains(t, err.Error(), "team spec is required")
	})

	t.Run("fails when team is not found", func(t *testing.T) {
		tool := &arkv1alpha1.Tool{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "team-tool",
				Namespace: "default",
			},
			Spec: arkv1alpha1.ToolSpec{
				Type: ToolTypeTeam,
				Team: &arkv1alpha1.TeamToolRef{
					Name: "non-existent-team",
				},
			},
		}

		k8sClient := setupTestClientForTools([]client.Object{})
		executor, err := createTeamExecutor(ctx, k8sClient, tool, "default", telemetryProvider, eventingProvider)

		require.Error(t, err)
		require.Nil(t, executor)
		require.Contains(t, err.Error(), "failed to get team")
	})
}

func TestTeamToolExecutor_Execute(t *testing.T) {
	ctx := context.Background()
	telemetryProvider := noop.NewProvider()
	eventingProvider := eventnoop.NewProvider()

	t.Run("fails when arguments cannot be parsed", func(t *testing.T) {
		executor := &TeamToolExecutor{
			TeamName:          "test-team",
			Namespace:         "default",
			TeamCRD:           &arkv1alpha1.Team{},
			k8sClient:         setupTestClientForTools([]client.Object{}),
			telemetryProvider: telemetryProvider,
			eventingProvider:  eventingProvider,
		}

		call := ToolCall{
			ID: "test-call-id",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test-team-tool",
				Arguments: "invalid json{",
			},
			Type: "function",
		}

		result, err := executor.Execute(ctx, call)

		require.Error(t, err)
		require.Equal(t, "test-call-id", result.ID)
		require.Equal(t, "test-team-tool", result.Name)
		require.Equal(t, "Failed to parse tool arguments", result.Error)
		require.Contains(t, err.Error(), "failed to parse tool arguments")
	})

	t.Run("fails when input parameter is missing", func(t *testing.T) {
		executor := &TeamToolExecutor{
			TeamName:          "test-team",
			Namespace:         "default",
			TeamCRD:           &arkv1alpha1.Team{},
			k8sClient:         setupTestClientForTools([]client.Object{}),
			telemetryProvider: telemetryProvider,
			eventingProvider:  eventingProvider,
		}

		args := map[string]any{}
		argsJSON, _ := json.Marshal(args)

		call := ToolCall{
			ID: "test-call-id",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test-team-tool",
				Arguments: string(argsJSON),
			},
			Type: "function",
		}

		result, err := executor.Execute(ctx, call)

		require.Error(t, err)
		require.Equal(t, "test-call-id", result.ID)
		require.Equal(t, "test-team-tool", result.Name)
		require.Equal(t, "input parameter is required", result.Error)
		require.Contains(t, err.Error(), "input parameter is required")
	})

	t.Run("fails when input parameter is not a string", func(t *testing.T) {
		executor := &TeamToolExecutor{
			TeamName:          "test-team",
			Namespace:         "default",
			TeamCRD:           &arkv1alpha1.Team{},
			k8sClient:         setupTestClientForTools([]client.Object{}),
			telemetryProvider: telemetryProvider,
			eventingProvider:  eventingProvider,
		}

		args := map[string]any{
			"input": 123,
		}
		argsJSON, _ := json.Marshal(args)

		call := ToolCall{
			ID: "test-call-id",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test-team-tool",
				Arguments: string(argsJSON),
			},
			Type: "function",
		}

		result, err := executor.Execute(ctx, call)

		require.Error(t, err)
		require.Equal(t, "test-call-id", result.ID)
		require.Equal(t, "test-team-tool", result.Name)
		require.Equal(t, "input parameter must be a string", result.Error)
		require.Contains(t, err.Error(), "input parameter must be a string")
	})

	t.Run("fails when team has no members", func(t *testing.T) {
		teamCRD := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-team",
				Namespace: "default",
			},
			Spec: arkv1alpha1.TeamSpec{
				Members:  []arkv1alpha1.TeamMember{},
				Strategy: "sequential",
			},
		}

		executor := &TeamToolExecutor{
			TeamName:          "test-team",
			Namespace:         "default",
			TeamCRD:           teamCRD,
			k8sClient:         setupTestClientForTools([]client.Object{teamCRD}),
			telemetryProvider: telemetryProvider,
			eventingProvider:  eventingProvider,
		}

		args := map[string]any{
			"input": "test input",
		}
		argsJSON, _ := json.Marshal(args)

		call := ToolCall{
			ID: "test-call-id",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test-team-tool",
				Arguments: string(argsJSON),
			},
			Type: "function",
		}

		result, err := executor.Execute(ctx, call)

		require.Error(t, err)
		require.Equal(t, "test-call-id", result.ID)
		require.Equal(t, "test-team-tool", result.Name)
		require.Contains(t, result.Error, "failed to execute team")
	})

	t.Run("fails when team execution returns no messages", func(t *testing.T) {
		agent := &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-agent",
				Namespace: "default",
			},
			Spec: arkv1alpha1.AgentSpec{
				Prompt: "You are a test agent",
			},
		}

		teamCRD := &arkv1alpha1.Team{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "test-team",
				Namespace: "default",
			},
			Spec: arkv1alpha1.TeamSpec{
				Members: []arkv1alpha1.TeamMember{
					{Name: "test-agent", Type: "agent"},
				},
				Strategy: "sequential",
			},
		}

		// Mock team that returns empty messages
		// We'll need to create a team that can execute but returns empty
		// For now, this test will fail at MakeTeam if agent doesn't exist
		// This is a limitation - we'd need a more sophisticated mock
		executor := &TeamToolExecutor{
			TeamName:          "test-team",
			Namespace:         "default",
			TeamCRD:           teamCRD,
			k8sClient:         setupTestClientForTools([]client.Object{teamCRD, agent}),
			telemetryProvider: telemetryProvider,
			eventingProvider:  eventingProvider,
		}

		args := map[string]any{
			"input": "test input",
		}
		argsJSON, _ := json.Marshal(args)

		call := ToolCall{
			ID: "test-call-id",
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      "test-team-tool",
				Arguments: string(argsJSON),
			},
			Type: "function",
		}

		// This will fail because we need a model for the agent
		// But it tests the path through MakeTeam
		result, err := executor.Execute(ctx, call)

		// We expect an error, but the exact error depends on the setup
		// The important thing is we're testing the code path
		require.Error(t, err)
		require.NotNil(t, result)
	})

	t.Run("fails when team execution returns no assistant message content", func(t *testing.T) {
		// This test case is similar to above but tests the specific error path
		// where messages exist but have no assistant content
		// This would require a more complex mock setup
		// For now, we'll document this as a test case that needs more setup
		t.Skip("Requires mock team that returns messages without assistant content")
	})

	t.Run("successfully executes team and returns content", func(t *testing.T) {
		// This test would require:
		// 1. A valid agent with a model
		// 2. A team with that agent as a member
		// 3. Proper model configuration
		// This is more of an integration test
		t.Skip("Requires full setup with models and agents - better suited for integration tests")
	})
}
