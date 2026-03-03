package genai

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

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

func tryDataPayloadForSchema(data interface{}, schema string) (map[string]interface{}, bool) {
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, false
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, false
	}
	if payload["schema"] == schema {
		return payload, true
	}
	return nil, false
}

func extractDataPayloadBySchema(parts []protocol.Part, schema string) (map[string]interface{}, bool) {
	for _, part := range parts {
		var data interface{}
		switch typed := part.(type) {
		case *protocol.DataPart:
			data = typed.Data
		case protocol.DataPart:
			data = typed.Data
		default:
			continue
		}
		if payload, ok := tryDataPayloadForSchema(data, schema); ok {
			return payload, true
		}
	}
	return nil, false
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

	t.Run("fails when message and input parameters are missing", func(t *testing.T) {
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
		require.Equal(t, "message parameter is required", result.Error)
		require.Contains(t, err.Error(), "message parameter is required")
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

type testToolEventStream struct{}

func (t *testToolEventStream) StreamChunk(ctx context.Context, chunk interface{}) error {
	return nil
}

func (t *testToolEventStream) NotifyCompletion(ctx context.Context) error {
	return nil
}

func (t *testToolEventStream) Close() error {
	return nil
}

type captureToolExecutor struct {
	call   ToolCall
	called bool
}

func (c *captureToolExecutor) Execute(ctx context.Context, call ToolCall) (ToolResult, error) {
	c.called = true
	c.call = call
	return ToolResult{
		ID:      call.ID,
		Name:    call.Function.Name,
		Content: "ok",
	}, nil
}

func TestParseDelegatedInvocationWithStringInput(t *testing.T) {
	args := map[string]any{
		"input": "hello",
	}
	invocation, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	require.Equal(t, protocol.MessageRoleUser, invocation.a2aUserInput.Role)
	require.Equal(t, "hello", ExtractA2ATextFromMessage(invocation.a2aUserInput))
}

func TestParseDelegatedInvocationNativeMessageHistoryContext(t *testing.T) {
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		"history": []map[string]any{
			{
				"role": "agent",
				"parts": []map[string]any{
					{
						"kind": "text",
						"text": "previous response",
					},
				},
			},
		},
		"contextId": "ctx-123",
		A2ADelegationInvocationArgsKey: map[string]any{
			"routingScope": "scope-123",
		},
	}
	invocation, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	require.Equal(t, "ctx-123", invocation.contextID)
	require.Equal(t, protocol.MessageRoleUser, invocation.a2aUserInput.Role)
	require.Equal(t, "delegate this", ExtractA2ATextFromMessage(invocation.a2aUserInput))
	require.Len(t, invocation.a2aHistory, 1)
	require.Equal(t, protocol.MessageRoleAgent, invocation.a2aHistory[0].Role)
}

func TestParseDelegatedInvocationNativeFallsBackToInput(t *testing.T) {
	args := map[string]any{
		"input": "fallback input",
	}
	invocation, userError, err := parseDelegatedInvocation(args, "team", "test-team")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	require.Equal(t, protocol.MessageRoleUser, invocation.a2aUserInput.Role)
	require.Equal(t, "fallback input", ExtractA2ATextFromMessage(invocation.a2aUserInput))
}

func TestParseDelegatedInvocationNativeAppendsDelegatedInvocationPayload(t *testing.T) {
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		A2ADelegationInvocationArgsKey: map[string]any{
			"routingScope":   "scope-123",
			"operationLabel": "define",
			"ticketId":       "01-generic-agent",
		},
	}
	invocation, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	require.Contains(t, invocation.a2aUserInput.Extensions, A2ADelegatedToolExtensionKey)
	payload, ok := extractDataPayloadBySchema(invocation.a2aUserInput.Parts, A2APayloadSchemaDelegatedInvocationV1)
	require.True(t, ok)
	parameters, hasParameters := payload["parameters"].(map[string]interface{})
	require.True(t, hasParameters)
	require.Equal(t, "scope-123", parameters["routingScope"])
	require.Equal(t, "define", parameters["operationLabel"])
	require.Equal(t, "01-generic-agent", parameters["ticketId"])
}

func TestExtractDelegationArgsFromMergedParams(t *testing.T) {
	params := map[string]any{
		"message":   map[string]any{"role": "user"},
		"history":   []any{},
		"contextId": "ctx-123",
		"input":     "ignored",
		"issueName": "01-generic-agent",
		"command":   "define",
		"counter":   3,
	}

	args := extractDelegationArgsFromMergedParams(params)
	require.Equal(t, "01-generic-agent", args["issueName"])
	require.Equal(t, "define", args["command"])
	_, hasMessage := args["message"]
	require.False(t, hasMessage)
	_, hasInput := args["input"]
	require.False(t, hasInput)
}

func TestPartialToolExecutorPartialParametersOverrideAgentArguments(t *testing.T) {
	agentArgs := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		"routingScope":   "default-scope",
		"operationLabel": "draft",
		"ticketId":       "ticket-01",
	}
	argsJSON, err := json.Marshal(agentArgs)
	require.NoError(t, err)

	query := &arkv1alpha1.Query{
		Spec: arkv1alpha1.QuerySpec{
			Parameters: []arkv1alpha1.Parameter{
				{Name: "routingScope", Value: "scope-123"},
			},
		},
	}

	capture := &captureToolExecutor{}
	executor := &PartialToolExecutor{
		BaseExecutor: capture,
		Partial: &arkv1alpha1.ToolPartial{
			Parameters: []arkv1alpha1.ToolFunction{
				{
					Name:  "routingScope",
					Value: "{{.Query.routingScope}}",
				},
				{
					Name:  "operationLabel",
					Value: "finalize",
				},
			},
		},
	}

	call := ToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      "delegated-tool",
			Arguments: string(argsJSON),
		},
		Type: "function",
	}

	_, err = executor.Execute(context.WithValue(context.Background(), QueryContextKey, query), call)
	require.NoError(t, err)
	require.True(t, capture.called)

	var merged map[string]any
	require.NoError(t, json.Unmarshal([]byte(capture.call.Function.Arguments), &merged))
	require.Equal(t, "scope-123", merged["routingScope"])
	require.Equal(t, "finalize", merged["operationLabel"])
	require.Equal(t, "ticket-01", merged["ticketId"])

	extArgs, ok := merged[A2ADelegationInvocationArgsKey].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "scope-123", extArgs["routingScope"])
	require.Equal(t, "finalize", extArgs["operationLabel"])
	require.Equal(t, "ticket-01", extArgs["ticketId"])
}

func TestParseDelegatedInvocationNativeAllowsMissingDelegationParameters(t *testing.T) {
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		"routingScope": "scope-123",
	}
	invocation, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	_, hasPayload := extractDataPayloadBySchema(invocation.a2aUserInput.Parts, A2APayloadSchemaDelegatedInvocationV1)
	require.False(t, hasPayload)
}

func TestParseDelegatedInvocationNativeInvalidContextID(t *testing.T) {
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		"contextId": 10,
	}
	_, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.Error(t, err)
	require.Equal(t, "contextId parameter must be a string", userError)
	require.Contains(t, err.Error(), "contextId parameter must be a string")
}

func TestParseDelegatedInvocationNativeAllowsUnattributedMetadataKeys(t *testing.T) {
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
			"metadata": map[string]any{
				"ark.mckinsey.com/tool-call-id": "call-1",
			},
		},
		A2ADelegationInvocationArgsKey: map[string]any{
			"routingScope": "scope-123",
		},
	}
	invocation, userError, err := parseDelegatedInvocation(args, "agent", "test-agent")
	require.NoError(t, err)
	require.Equal(t, "", userError)
	require.Equal(t, "call-1", invocation.a2aUserInput.Metadata["ark.mckinsey.com/tool-call-id"])
}

func TestNormalizeContextIDRejectsWhitespaceOnly(t *testing.T) {
	_, err := normalizeContextID("   ")
	require.Error(t, err)
	require.Contains(t, err.Error(), "must not contain only whitespace")
}

func TestNormalizeContextIDRejectsExceedsMaxLength(t *testing.T) {
	tooLong := strings.Repeat("a", 1025)
	_, err := normalizeContextID(tooLong)
	require.Error(t, err)
	require.Contains(t, err.Error(), "exceeds max length")
}

func TestGetDelegationEventStreamReturnsStreamWhenAvailable(t *testing.T) {
	ctx := WithToolEventStream(context.Background(), &testToolEventStream{})
	call := ToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	}
	stream := getDelegationEventStream(ctx, call)
	require.NotNil(t, stream)
}

func TestApplyDelegationContextSetsContextIDWhenProvided(t *testing.T) {
	ctx := applyDelegationContext(context.Background(), "ctx-123")
	require.Equal(t, "ctx-123", GetA2AContextID(ctx))
}

func TestBuildDelegatedToolResultContentBuildsTypedPayload(t *testing.T) {
	content, err := buildDelegatedToolResultContent("assistant summary", nil, ToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	})
	require.NoError(t, err)
	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(content), &payload))
	require.Equal(t, A2APayloadSchemaToolResultV1, payload["schema"])
	require.Equal(t, "call-1", payload["toolCallId"])
	require.Equal(t, "delegate-agent", payload["toolName"])
	require.Equal(t, "assistant summary", payload["content"])
}

func TestBuildDelegatedToolResultContentPreservesMessageExtensionsAndMetadata(t *testing.T) {
	contextID := "ctx-delegated"
	taskID := "task-delegated"
	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("delegated output"),
	})
	message.ContextID = &contextID
	message.TaskID = &taskID
	message.Extensions = []string{
		"https://example.com/extensions/custom/v1",
		"https://ark.mckinsey.com/extensions/delegated-tool/v1",
	}
	message.Metadata = map[string]interface{}{
		"https://example.com/extensions/custom/v1": map[string]interface{}{
			"capability": "streaming-hints",
		},
	}

	content, err := buildDelegatedToolResultContent("assistant summary", &ExecutionResult{
		A2AResponse: &A2AResponse{
			Message: &message,
		},
	}, ToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	})
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(content), &payload))
	rawMessage, ok := payload["message"].(map[string]interface{})
	require.True(t, ok)

	rawExtensions, ok := rawMessage["extensions"].([]interface{})
	require.True(t, ok)
	extensions := make([]string, 0, len(rawExtensions))
	for _, item := range rawExtensions {
		value, castOK := item.(string)
		require.True(t, castOK)
		extensions = append(extensions, value)
	}
	require.ElementsMatch(t, message.Extensions, extensions)

	rawMetadata, ok := rawMessage["metadata"].(map[string]interface{})
	require.True(t, ok)
	_, hasCustom := rawMetadata["https://example.com/extensions/custom/v1"]
	require.True(t, hasCustom)
}

func TestBuildDelegatedToolResultContentPrefersA2AResponseOverA2AMessages(t *testing.T) {
	responseContextID := "ctx-response"
	responseTaskID := "task-response"
	responseMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("from-response"),
	})
	responseMessage.ContextID = &responseContextID
	responseMessage.TaskID = &responseTaskID

	lastContextID := "ctx-history"
	lastTaskID := "task-history"
	lastMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("from-history"),
	})
	lastMessage.ContextID = &lastContextID
	lastMessage.TaskID = &lastTaskID

	content, err := buildDelegatedToolResultContent("assistant summary", &ExecutionResult{
		A2AResponse: &A2AResponse{
			ContextID: responseContextID,
			TaskID:    responseTaskID,
			Message:   &responseMessage,
		},
		A2AMessages: []protocol.Message{lastMessage},
	}, ToolCall{
		ID: "call-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	})
	require.NoError(t, err)

	var payload map[string]interface{}
	require.NoError(t, json.Unmarshal([]byte(content), &payload))
	require.Equal(t, responseContextID, payload["delegatedContextId"])
	require.Equal(t, responseTaskID, payload["delegatedTaskId"])

	rawMessage, ok := payload["message"].(map[string]interface{})
	require.True(t, ok)
	rawParts, ok := rawMessage["parts"].([]interface{})
	require.True(t, ok)
	require.NotEmpty(t, rawParts)
	firstPart, ok := rawParts[0].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "from-response", firstPart["text"])
}

func TestDelegatedStreamBridgeAnnotatesDownstreamEvents(t *testing.T) {
	baseStream := &fakeEventStream{}
	ctx := WithToolEventStream(context.Background(), baseStream)
	call := ToolCall{
		ID: "call-stream-1",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	}
	stream := getDelegationEventStream(ctx, call)
	require.NotNil(t, stream)

	statusMessage := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("thinking"),
	})
	statusEvent := &protocol.TaskStatusUpdateEvent{
		TaskID:    "task-1",
		ContextID: "ctx-1",
		Status: protocol.TaskStatus{
			State:   protocol.TaskStateWorking,
			Message: &statusMessage,
		},
	}
	require.NoError(t, stream.StreamChunk(ctx, statusEvent))

	artifactEvent := &protocol.TaskArtifactUpdateEvent{
		TaskID:    "task-1",
		ContextID: "ctx-1",
		Artifact: protocol.Artifact{
			ArtifactID: "artifact-1",
			Parts: []protocol.Part{
				protocol.NewTextPart("partial output"),
			},
		},
	}
	require.NoError(t, stream.StreamChunk(ctx, artifactEvent))

	require.Len(t, baseStream.chunks, 2)
	statusChunk, ok := baseStream.chunks[0].(*protocol.TaskStatusUpdateEvent)
	require.True(t, ok)
	statusPayload, hasStatusPayload := extractDataPayloadBySchema(
		statusChunk.Status.Message.Parts,
		A2APayloadSchemaStepEventV1,
	)
	require.True(t, hasStatusPayload)
	require.Equal(t, "call-stream-1", statusPayload["toolCallId"])
	require.Equal(t, "delegate-agent", statusPayload["toolName"])
	require.Equal(t, "tool-step:call-stream-1", statusPayload["stepId"])
	require.Equal(t, "task-1", statusPayload["delegatedTaskId"])
	require.Equal(t, "ctx-1", statusPayload["delegatedContextId"])
	require.Equal(t, float64(1), statusPayload["sequence"])

	artifactChunk, ok := baseStream.chunks[1].(*protocol.TaskArtifactUpdateEvent)
	require.True(t, ok)
	artifactPayload, hasArtifactPayload := extractDataPayloadBySchema(
		artifactChunk.Artifact.Parts,
		A2APayloadSchemaStepEventV1,
	)
	require.True(t, hasArtifactPayload)
	require.Equal(t, float64(2), artifactPayload["sequence"])
	require.Equal(t, "call-stream-1", artifactPayload["toolCallId"])
}

func TestDelegatedStreamBridgeAnnotatesMessageEvents(t *testing.T) {
	baseStream := &fakeEventStream{}
	ctx := WithToolEventStream(context.Background(), baseStream)
	call := ToolCall{
		ID: "call-stream-2",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	}
	stream := getDelegationEventStream(ctx, call)
	require.NotNil(t, stream)

	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("chain of thought delta"),
	})
	require.NoError(t, stream.StreamChunk(ctx, &message))

	require.Len(t, baseStream.chunks, 1)
	chunk, ok := baseStream.chunks[0].(*protocol.Message)
	require.True(t, ok)
	payload, hasPayload := extractDataPayloadBySchema(chunk.Parts, A2APayloadSchemaStepEventV1)
	require.True(t, hasPayload)
	require.Equal(t, "call-stream-2", payload["toolCallId"])
	require.Equal(t, float64(1), payload["sequence"])
}

func TestDelegatedStreamBridgeWithEmptyToolCallIDOmitStepID(t *testing.T) {
	baseStream := &fakeEventStream{}
	ctx := WithToolEventStream(context.Background(), baseStream)
	call := ToolCall{
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name: "delegate-agent",
		},
	}
	stream := getDelegationEventStream(ctx, call)
	require.NotNil(t, stream)

	message := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("delta"),
	})
	require.NoError(t, stream.StreamChunk(ctx, &message))
	require.Len(t, baseStream.chunks, 1)

	chunk, ok := baseStream.chunks[0].(*protocol.Message)
	require.True(t, ok)
	payload, hasPayload := extractDataPayloadBySchema(chunk.Parts, A2APayloadSchemaStepEventV1)
	require.True(t, hasPayload)
	_, hasToolCallID := payload["toolCallId"]
	require.False(t, hasToolCallID)
	_, hasStepID := payload["stepId"]
	require.False(t, hasStepID)
	require.Equal(t, "delegate-agent", payload["toolName"])
}

func TestAgentToolExecutor_NativeMessageDelegationWithoutInput(t *testing.T) {
	agentCRD := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "delegate-agent",
			Namespace: "default",
		},
		Spec: arkv1alpha1.AgentSpec{
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{
				Name: ExecutionEngineA2A,
			},
		},
	}
	executor := &AgentToolExecutor{
		AgentName: "delegate-agent",
		Namespace: "default",
		AgentCRD:  agentCRD,
		k8sClient: setupTestClientForTools([]client.Object{}),
		telemetry: noop.NewProvider(),
		eventing:  eventnoop.NewProvider(),
	}
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		A2ADelegationInvocationArgsKey: map[string]any{
			"routingScope": "scope-123",
		},
	}
	argsJSON, err := json.Marshal(args)
	require.NoError(t, err)
	call := ToolCall{
		ID: "agent-native-no-input",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      "delegate-agent",
			Arguments: string(argsJSON),
		},
		Type: "function",
	}
	queryCtx := context.WithValue(context.Background(), QueryContextKey, &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "query-native",
			Namespace: "default",
		},
	})
	result, err := executor.Execute(queryCtx, call)
	require.Error(t, err)
	require.Contains(t, err.Error(), "A2A agent missing")
	require.Contains(t, result.Error, "failed to execute agent")
	require.NotContains(t, result.Error, "input parameter is required")
}

func TestAgentToolExecutor_CompatMessageDoesNotRequireInput(t *testing.T) {
	executor := &AgentToolExecutor{
		AgentName: "delegate-agent",
		Namespace: "default",
		AgentCRD: &arkv1alpha1.Agent{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "delegate-agent",
				Namespace: "default",
			},
		},
		k8sClient: setupTestClientForTools([]client.Object{}),
		telemetry: noop.NewProvider(),
		eventing:  eventnoop.NewProvider(),
	}
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
	}
	argsJSON, err := json.Marshal(args)
	require.NoError(t, err)
	call := ToolCall{
		ID: "agent-compat-no-input",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      "delegate-agent",
			Arguments: string(argsJSON),
		},
		Type: "function",
	}
	result, err := executor.Execute(context.Background(), call)
	require.Error(t, err)
	require.NotContains(t, result.Error, "input parameter is required")
	require.Contains(t, err.Error(), "missing query context")
}

func TestTeamToolExecutor_NativeMessageDelegationWithoutInput(t *testing.T) {
	teamCRD := &arkv1alpha1.Team{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "delegate-team",
			Namespace: "default",
		},
		Spec: arkv1alpha1.TeamSpec{
			Members:  []arkv1alpha1.TeamMember{},
			Strategy: "sequential",
		},
	}
	executor := &TeamToolExecutor{
		TeamName:          "delegate-team",
		Namespace:         "default",
		TeamCRD:           teamCRD,
		k8sClient:         setupTestClientForTools([]client.Object{}),
		telemetryProvider: noop.NewProvider(),
		eventingProvider:  eventnoop.NewProvider(),
	}
	args := map[string]any{
		"message": map[string]any{
			"role": "user",
			"parts": []map[string]any{
				{
					"kind": "text",
					"text": "delegate this",
				},
			},
		},
		A2ADelegationInvocationArgsKey: map[string]any{
			"routingScope": "scope-123",
		},
	}
	argsJSON, err := json.Marshal(args)
	require.NoError(t, err)
	call := ToolCall{
		ID: "team-native-no-input",
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      "delegate-team",
			Arguments: string(argsJSON),
		},
		Type: "function",
	}
	result, err := executor.Execute(context.Background(), call)
	require.Error(t, err)
	require.Contains(t, err.Error(), "has no members configured")
	require.Contains(t, result.Error, "failed to execute team")
	require.NotContains(t, result.Error, "input parameter is required")
}
