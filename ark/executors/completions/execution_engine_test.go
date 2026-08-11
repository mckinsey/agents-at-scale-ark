package completions

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/telemetry/noop"
)

func namedAssistantMessage(name, content string) Message {
	msg := NewAssistantMessage(content)
	msg.OfAssistant.Name = openai.String(name)
	return msg
}

func engineTestScheme(t *testing.T) *runtime.Scheme {
	t.Helper()
	scheme := runtime.NewScheme()
	require.NoError(t, arkv1alpha1.AddToScheme(scheme))
	require.NoError(t, arkv1prealpha1.AddToScheme(scheme))
	return scheme
}

func engineTestClient(t *testing.T, objects ...client.Object) client.Client {
	t.Helper()
	return fake.NewClientBuilder().WithScheme(engineTestScheme(t)).WithObjects(objects...).Build()
}

func engineStub(t *testing.T, reply string, captured *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)

		var request map[string]any
		require.NoError(t, json.Unmarshal(body, &request))
		if captured != nil {
			*captured = request
		}

		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      request["id"],
			"result": map[string]any{
				"kind":      "message",
				"role":      "agent",
				"messageId": "reply-1",
				"parts":     []map[string]any{{"kind": "text", "text": reply}},
			},
		}))
	}))
}

func engineQueryContext(t *testing.T) context.Context {
	t.Helper()
	return context.WithValue(context.Background(), QueryContextKey, &arkv1alpha1.Query{
		ObjectMeta: metav1.ObjectMeta{Name: "my-query", Namespace: "default"},
	})
}

func TestNamedExecutionEngineExecute(t *testing.T) {
	var captured map[string]any
	stub := engineStub(t, "member reply", &captured)
	defer stub.Close()

	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: stub.URL},
	}
	k8sClient := engineTestClient(t, engine)

	stream := &mockEventStream{}
	e := NewNamedExecutionEngine(k8sClient, eventnoop.NewProvider().A2aRecorder())

	result, err := e.Execute(engineQueryContext(t), NamedEngineRequest{
		AgentName:   "member-a",
		Namespace:   "default",
		EngineRef:   &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		UserInput:   NewUserMessage("what is the weather?"),
		EventStream: stream,
	})

	require.NoError(t, err)
	require.NotNil(t, result.A2AResponse)
	assert.Equal(t, "member reply", result.A2AResponse.Content)
	require.Len(t, result.Messages, 1)
	assert.Equal(t, "member reply", result.Messages[0].OfAssistant.Content.OfString.Value)
	assert.Len(t, stream.chunks, 1)

	params, ok := captured["params"].(map[string]any)
	require.True(t, ok, "request has params")
	message, ok := params["message"].(map[string]any)
	require.True(t, ok, "params has a message")

	assert.Equal(t, []any{arka2a.QueryExtensionURI}, message["extensions"])

	metadata, ok := message["metadata"].(map[string]any)
	require.True(t, ok, "message has metadata")
	ref, ok := metadata[arka2a.QueryExtensionMetadataKey].(map[string]any)
	require.True(t, ok, "metadata carries the query ref")

	assert.Equal(t, "my-query", ref["name"])
	assert.Equal(t, "default", ref["namespace"])
	assert.Equal(t, map[string]any{"type": "agent", "name": "member-a"}, ref["target"])
}

func TestNamedExecutionEngineSendsRenderedHistory(t *testing.T) {
	var captured map[string]any
	stub := engineStub(t, "ok", &captured)
	defer stub.Close()

	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: stub.URL},
	}
	e := NewNamedExecutionEngine(engineTestClient(t, engine), eventnoop.NewProvider().A2aRecorder())

	_, err := e.Execute(engineQueryContext(t), NamedEngineRequest{
		AgentName:   "member-b",
		Namespace:   "default",
		EngineRef:   &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		UserInput:   NewUserMessage("continue"),
		History:     []Message{namedAssistantMessage("member-a", "the capital is Paris")},
		EventStream: &mockEventStream{},
	})
	require.NoError(t, err)

	params := captured["params"].(map[string]any)
	message := params["message"].(map[string]any)
	parts := message["parts"].([]any)
	text := parts[0].(map[string]any)["text"].(string)

	assert.Contains(t, text, "the capital is Paris")
	assert.Contains(t, text, "continue")
}

func TestNamedExecutionEngineMissingQueryContext(t *testing.T) {
	e := NewNamedExecutionEngine(engineTestClient(t), eventnoop.NewProvider().A2aRecorder())

	_, err := e.Execute(context.Background(), NamedEngineRequest{
		AgentName: "member-a",
		Namespace: "default",
		EngineRef: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		UserInput: NewUserMessage("hi"),
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing query context")
}

func TestNamedExecutionEngineUnresolvedEngine(t *testing.T) {
	e := NewNamedExecutionEngine(engineTestClient(t), eventnoop.NewProvider().A2aRecorder())

	_, err := e.Execute(engineQueryContext(t), NamedEngineRequest{
		AgentName:   "member-a",
		Namespace:   "default",
		EngineRef:   &arkv1alpha1.ExecutionEngineRef{Name: "missing-engine"},
		UserInput:   NewUserMessage("hi"),
		EventStream: &mockEventStream{},
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "execution engine missing-engine not found")
}

func TestNamedExecutionEngineCallFailure(t *testing.T) {
	stub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer stub.Close()

	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: stub.URL},
	}
	stream := &mockEventStream{}
	e := NewNamedExecutionEngine(engineTestClient(t, engine), eventnoop.NewProvider().A2aRecorder())

	_, err := e.Execute(engineQueryContext(t), NamedEngineRequest{
		AgentName:   "member-a",
		Namespace:   "default",
		EngineRef:   &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		UserInput:   NewUserMessage("hi"),
		EventStream: stream,
	})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "execution engine mock-engine call failed")
	assert.NotEmpty(t, stream.chunks, "the failure is streamed to the caller")
}

func TestDispatchesToEngine(t *testing.T) {
	tests := []struct {
		name          string
		ref           *arkv1alpha1.ExecutionEngineRef
		subTargetName string
		want          bool
	}{
		{name: "no engine runs locally", ref: nil, want: false},
		{name: "a2a engine dispatches", ref: &arkv1alpha1.ExecutionEngineRef{Name: arka2a.ExecutionEngineA2A}, want: true},
		{name: "named engine dispatches", ref: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"}, want: true},
		{
			name:          "named engine runs locally when it is the sub-target",
			ref:           &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
			subTargetName: "member-a",
			want:          false,
		},
		{
			name:          "a different sub-target still dispatches",
			ref:           &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
			subTargetName: "other-agent",
			want:          true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.subTargetName != "" {
				ctx = WithSubTargetAgent(ctx, tt.subTargetName)
			}
			assert.Equal(t, tt.want, dispatchesToEngine(ctx, tt.ref, "member-a"))
		})
	}
}

func TestRenderEngineInput(t *testing.T) {
	tests := []struct {
		name      string
		userInput Message
		history   []Message
		want      string
	}{
		{
			name:      "no history returns the bare user text",
			userInput: NewUserMessage("what is the weather?"),
			want:      "what is the weather?",
		},
		{
			name:      "history is prefixed to the user text",
			userInput: NewUserMessage("and tomorrow?"),
			history:   []Message{namedAssistantMessage("member-a", "today is sunny")},
			want:      "# member-a:\ntoday is sunny\n\n\nand tomorrow?",
		},
		{
			name:      "multiple turns are rendered in order",
			userInput: NewUserMessage("summarise"),
			history: []Message{
				NewUserMessage("what is 2+2?"),
				namedAssistantMessage("member-a", "4"),
			},
			want: "# user:\nwhat is 2+2?\n\n# member-a:\n4\n\n\nsummarise",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, renderEngineInput(tt.userInput, tt.history))
		})
	}
}

func TestExecuteAgentRouting(t *testing.T) {
	t.Run("named engine reaches the execution engine", func(t *testing.T) {
		var captured map[string]any
		stub := engineStub(t, "engine reply", &captured)
		defer stub.Close()

		engine := &arkv1prealpha1.ExecutionEngine{
			ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
			Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: stub.URL},
		}

		agent := &Agent{
			Name:            "member-a",
			Namespace:       "default",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
			client:          engineTestClient(t, engine),
			eventing:        eventnoop.NewProvider(),
		}

		result, err := agent.executeAgent(engineQueryContext(t), NewUserMessage("hi"), nil, nil, &mockEventStream{}, ExecuteOptions{})
		require.NoError(t, err)
		assert.Equal(t, "engine reply", result.A2AResponse.Content)

		ref := captured["params"].(map[string]any)["message"].(map[string]any)["metadata"].(map[string]any)[arka2a.QueryExtensionMetadataKey].(map[string]any)
		assert.Equal(t, map[string]any{"type": "agent", "name": "member-a"}, ref["target"],
			"the engine path must name the member it is being asked to run")
	})

	t.Run("a2a engine still takes the A2AServer path", func(t *testing.T) {
		agent := &Agent{
			Name:            "a2a-agent",
			Namespace:       "default",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: arka2a.ExecutionEngineA2A},
			client:          engineTestClient(t),
			eventing:        eventnoop.NewProvider(),
		}

		_, err := agent.executeAgent(engineQueryContext(t), NewUserMessage("hi"), nil, nil, &mockEventStream{}, ExecuteOptions{})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "annotation")
	})

	t.Run("sub-target agent runs locally instead of dispatching", func(t *testing.T) {
		agent := &Agent{
			Name:            "member-a",
			Namespace:       "default",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
			client:          engineTestClient(t),
			eventing:        eventnoop.NewProvider(),
		}

		ctx := WithSubTargetAgent(engineQueryContext(t), "member-a")
		_, err := agent.executeAgent(ctx, NewUserMessage("hi"), nil, nil, &mockEventStream{}, ExecuteOptions{})

		require.Error(t, err)
		assert.Contains(t, err.Error(), "has no model configured")
	})
}

func TestRenderEngineInputKeepsSystemMessages(t *testing.T) {
	rendered := renderEngineInput(
		NewUserMessage("Reply with only the name of the next speaker."),
		[]Message{NewSystemMessage("Roles: researcher, analyst.\nSelect the next speaker.")},
	)

	assert.Contains(t, rendered, "Roles: researcher, analyst.")
	assert.Contains(t, rendered, "Select the next speaker.")
	assert.Contains(t, rendered, "Reply with only the name of the next speaker.")
}

func TestNamedExecutionEngineSendsSelectorPrompt(t *testing.T) {
	var captured map[string]any
	stub := engineStub(t, "analyst", &captured)
	defer stub.Close()

	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: stub.URL},
	}

	agent := &Agent{
		Name:            "selector-agent",
		Namespace:       "default",
		ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		client:          engineTestClient(t, engine),
		eventing:        eventnoop.NewProvider(),
	}

	_, err := agent.executeAgent(
		engineQueryContext(t),
		NewUserMessage("Reply with only the name of the next speaker to respond."),
		[]Message{NewSystemMessage("The following roles are available: researcher, analyst.")},
		nil, &mockEventStream{}, ExecuteOptions{},
	)
	require.NoError(t, err)

	text := captured["params"].(map[string]any)["message"].(map[string]any)["parts"].([]any)[0].(map[string]any)["text"].(string)
	assert.Contains(t, text, "researcher, analyst",
		"an engine selector that never sees the candidate names cannot select one")
}

func TestMakeAgentSelfDispatchingEngineExplainsModelRequirement(t *testing.T) {
	agentCRD := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "member-a", Namespace: "default"},
		Spec: arkv1alpha1.AgentSpec{
			Prompt:          "You are member A",
			ModelRef:        &arkv1alpha1.AgentModelRef{Name: "default"},
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "ark-completions"},
		},
	}
	k8sClient := engineTestClient(t, agentCRD)
	ctx := WithSubTargetAgent(engineQueryContext(t), "member-a")

	_, err := MakeAgent(ctx, k8sClient, agentCRD, noop.NewProvider(), eventnoop.NewProvider())

	require.Error(t, err)
	assert.Contains(t, err.Error(), "resolves back to this completions engine")
	assert.Contains(t, err.Error(), "needs a usable modelRef")
}
