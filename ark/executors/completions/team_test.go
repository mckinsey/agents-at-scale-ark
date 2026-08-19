package completions

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	arkann "mckinsey.com/ark/internal/annotations"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

type execMockTeamMember struct {
	name     string
	execFunc func(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error)
}

func (m *execMockTeamMember) GetName() string        { return m.name }
func (m *execMockTeamMember) GetType() string        { return MemberTypeAgent }
func (m *execMockTeamMember) GetDescription() string { return "" }
func (m *execMockTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error) {
	return m.execFunc(ctx, userInput, history, memory, eventStream, opts)
}

func newTestTeam(members []TeamMember, strategy string, loops bool, maxTurns *int) *Team {
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	return &Team{
		Name:              "test-team",
		Namespace:         "default",
		Members:           members,
		Strategy:          strategy,
		Loops:             loops,
		MaxTurns:          maxTurns,
		telemetryRecorder: tp.TeamRecorder(),
		eventingRecorder:  ep.TeamRecorder(),
		telemetry:         tp,
		eventing:          ep,
	}
}

func intPtr(i int) *int { return &i }

func TestExecute_NoMembers(t *testing.T) {
	team := newTestTeam(nil, "sequential", false, nil)
	_, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no members configured")
}

func TestExecute_UnsupportedStrategy(t *testing.T) {
	members := []TeamMember{
		&execMockTeamMember{name: "a", execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
			return &ExecutionResult{Messages: []Message{NewAssistantMessage("ok")}}, nil
		}},
	}
	team := newTestTeam(members, "unknown-strategy", false, nil)
	_, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported strategy")
}

func TestExecute_DeprecatedStrategiesUnsupported(t *testing.T) {
	members := []TeamMember{
		&execMockTeamMember{name: "a", execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
			return &ExecutionResult{Messages: []Message{NewAssistantMessage("ok")}}, nil
		}},
	}
	for _, strategy := range []string{"graph", "round-robin"} {
		t.Run(strategy, func(t *testing.T) {
			team := newTestTeam(members, strategy, false, nil)
			_, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
			require.Error(t, err)
			assert.Contains(t, err.Error(), "unsupported strategy")
		})
	}
}

func TestExecuteSequential_SinglePass(t *testing.T) {
	var order []string
	makeMember := func(name string) *execMockTeamMember {
		return &execMockTeamMember{
			name: name,
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				order = append(order, name)
				return &ExecutionResult{Messages: []Message{NewAssistantMessage(name + " response")}}, nil
			},
		}
	}

	members := []TeamMember{makeMember("m1"), makeMember("m2"), makeMember("m3")}
	team := newTestTeam(members, "sequential", false, nil)

	result, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Equal(t, []string{"m1", "m2", "m3"}, order)
	assert.Len(t, result.Messages, 3)
}

func TestExecuteSequentialWithLoops_MaxTurns(t *testing.T) {
	var callCount int
	makeMember := func(name string) *execMockTeamMember {
		return &execMockTeamMember{
			name: name,
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				callCount++
				return &ExecutionResult{Messages: []Message{NewAssistantMessage(name + " response")}}, nil
			},
		}
	}

	members := []TeamMember{makeMember("m1"), makeMember("m2")}
	team := newTestTeam(members, "sequential", true, intPtr(4))

	result, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Equal(t, 4, callCount)
	lastMsg := result.Messages[len(result.Messages)-1]
	assert.NotNil(t, lastMsg.OfSystem)
	assert.Contains(t, lastMsg.OfSystem.Content.OfString.Value, "maximum turns")
}

func TestExecuteSequentialWithLoops_TerminateTeam(t *testing.T) {
	members := []TeamMember{
		&execMockTeamMember{
			name: "m1",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				return &ExecutionResult{Messages: []Message{NewAssistantMessage("done")}, Signal: &TerminateSignal{}}, nil
			},
		},
		&execMockTeamMember{
			name: "m2",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				t.Fatal("m2 should not be called")
				return nil, nil
			},
		},
	}
	team := newTestTeam(members, "sequential", true, intPtr(10))

	result, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Len(t, result.Messages, 1)
}

func TestExecuteSequential_MemberError(t *testing.T) {
	members := []TeamMember{
		&execMockTeamMember{
			name: "m1",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				return nil, fmt.Errorf("something broke")
			},
		},
	}
	team := newTestTeam(members, "sequential", false, nil)

	_, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "something broke")
}

func TestExecuteSequential_ContextCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	members := []TeamMember{
		&execMockTeamMember{
			name: "m1",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				t.Fatal("should not be called")
				return nil, nil
			},
		},
	}
	team := newTestTeam(members, "sequential", false, nil)

	_, err := team.Execute(ctx, NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
}

func TestExecuteSequential_ForwardsTranscriptToMembers(t *testing.T) {
	var secondMemberHistory []Message

	members := []TeamMember{
		&execMockTeamMember{
			name: "m1",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				return &ExecutionResult{Messages: []Message{NewAssistantMessage("the capital is Paris")}}, nil
			},
		},
		&execMockTeamMember{
			name: "m2",
			execFunc: func(_ context.Context, _ Message, history []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				secondMemberHistory = history
				return &ExecutionResult{Messages: []Message{NewAssistantMessage("population is 2.1m")}}, nil
			},
		},
	}

	team := newTestTeam(members, "sequential", false, nil)
	_, err := team.Execute(context.Background(), NewUserMessage("tell me about France"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)

	rendered := renderEngineInput(NewUserMessage("tell me about France"), secondMemberHistory)
	assert.Contains(t, rendered, "the capital is Paris", "the second member must see the first member's output")
}

func TestMakeTeam_EngineMemberNeedsNoModel(t *testing.T) {
	agent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "engine-member", Namespace: "default"},
		Spec: arkv1alpha1.AgentSpec{
			Prompt:          "You are helpful",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		},
	}
	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: "http://mock-engine:8080"},
	}
	teamCRD := &arkv1alpha1.Team{
		ObjectMeta: metav1.ObjectMeta{Name: "engine-team", Namespace: "default"},
		Spec: arkv1alpha1.TeamSpec{
			Strategy: "sequential",
			Members:  []arkv1alpha1.TeamMember{{Type: MemberTypeAgent, Name: "engine-member"}},
		},
	}

	k8sClient := engineTestClient(t, agent, engine)
	ctx := engineQueryContext(t)

	team, err := MakeTeam(ctx, k8sClient, teamCRD, telemetrynoop.NewProvider(), eventingnoop.NewProvider())
	require.NoError(t, err)
	require.Len(t, team.Members, 1)
	assert.Equal(t, "engine-member", team.Members[0].GetName())
}

type mixedTeamHarness struct {
	team           *Team
	ctx            context.Context
	engineCaptured *map[string]any
	a2aCaptured    *map[string]any
}

func mixedTeamFixture(t *testing.T, name string, spec arkv1alpha1.TeamSpec) *mixedTeamHarness {
	t.Helper()

	llm := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"cmpl-1","object":"chat.completion","created":0,"model":"gpt-test","choices":[{"index":0,"message":{"role":"assistant","content":"local answer"},"finish_reason":"stop"}],"usage":{}}`))
	}))
	t.Cleanup(llm.Close)

	captured := new(map[string]any)
	engineServer := engineStub(t, "engine reply", captured)
	t.Cleanup(engineServer.Close)

	a2aCaptured := new(map[string]any)
	a2aStub := engineStub(t, "a2a reply", a2aCaptured)
	t.Cleanup(a2aStub.Close)

	model := &arkv1alpha1.Model{
		ObjectMeta: metav1.ObjectMeta{Name: "test-model", Namespace: "default"},
		Spec: arkv1alpha1.ModelSpec{
			Model:    arkv1alpha1.ValueSource{Value: "gpt-test"},
			Provider: ProviderOpenAI,
			Config: arkv1alpha1.ModelConfig{
				OpenAI: &arkv1alpha1.OpenAIModelConfig{
					BaseURL: arkv1alpha1.ValueSource{Value: llm.URL},
					APIKey:  arkv1alpha1.ValueSource{Value: "test"},
				},
			},
		},
	}
	localAgent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "local-member", Namespace: "default"},
		Spec: arkv1alpha1.AgentSpec{
			Description: "Runs on the built-in completions engine",
			Prompt:      "You are the local member",
			ModelRef:    &arkv1alpha1.AgentModelRef{Name: "test-model"},
		},
	}
	engineAgent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{Name: "engine-member", Namespace: "default"},
		Spec: arkv1alpha1.AgentSpec{
			Description:     "Runs on a named execution engine",
			Prompt:          "You are the engine member",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: "mock-engine"},
		},
	}
	engine := &arkv1prealpha1.ExecutionEngine{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-engine", Namespace: "default"},
		Status:     arkv1prealpha1.ExecutionEngineStatus{LastResolvedAddress: engineServer.URL},
	}
	a2aAgent := &arkv1alpha1.Agent{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "a2a-member",
			Namespace: "default",
			Annotations: map[string]string{
				arkann.A2AServerAddress: a2aStub.URL,
				arkann.A2AServerName:    "mock-a2a",
			},
		},
		Spec: arkv1alpha1.AgentSpec{
			Description:     "Runs on the built-in a2a engine",
			Prompt:          "You are the a2a member",
			ExecutionEngine: &arkv1alpha1.ExecutionEngineRef{Name: arka2a.ExecutionEngineA2A},
		},
	}
	a2aServerCRD := &arkv1prealpha1.A2AServer{
		ObjectMeta: metav1.ObjectMeta{Name: "mock-a2a", Namespace: "default"},
	}

	if len(spec.Members) == 0 {
		spec.Members = []arkv1alpha1.TeamMember{
			{Type: MemberTypeAgent, Name: "local-member"},
			{Type: MemberTypeAgent, Name: "engine-member"},
		}
	}
	teamCRD := &arkv1alpha1.Team{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: "default"},
		Spec:       spec,
	}

	ctx := engineQueryContext(t)
	team, err := MakeTeam(ctx, engineTestClient(t, model, localAgent, engineAgent, engine, a2aAgent, a2aServerCRD),
		teamCRD, telemetrynoop.NewProvider(), eventingnoop.NewProvider())
	require.NoError(t, err)
	t.Cleanup(team.Close)

	return &mixedTeamHarness{team: team, ctx: ctx, engineCaptured: captured, a2aCaptured: a2aCaptured}
}

func engineInputText(t *testing.T, captured map[string]any) string {
	t.Helper()
	parts, ok := capturedMessage(t, captured)["parts"].([]any)
	require.True(t, ok, "message has parts")
	require.NotEmpty(t, parts)
	text, ok := parts[0].(map[string]any)["text"].(string)
	require.True(t, ok, "first part is text")
	return text
}

func TestMakeTeam_MixedLocalAndEngineMembers(t *testing.T) {
	h := mixedTeamFixture(t, "mixed-team", arkv1alpha1.TeamSpec{Strategy: "sequential"})

	require.Len(t, h.team.Members, 2)
	assert.Equal(t, "local-member", h.team.Members[0].GetName())
	assert.Equal(t, "engine-member", h.team.Members[1].GetName())

	result, err := h.team.Execute(h.ctx, NewUserMessage("hi"), nil, NewNoopMemory(), nil, ExecuteOptions{})
	require.NoError(t, err)
	require.Len(t, result.Messages, 2)

	assert.Equal(t, "local answer", result.Messages[0].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "local-member", result.Messages[0].OfAssistant.Name.Value)
	assert.Equal(t, "engine reply", result.Messages[1].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "engine-member", result.Messages[1].OfAssistant.Name.Value)

	captured := *h.engineCaptured
	require.NotNil(t, captured, "the engine member must reach the execution engine")
	assert.Equal(t, map[string]any{"type": "agent", "name": "engine-member"},
		capturedRef(t, captured)["target"])

	engineInput := engineInputText(t, captured)
	assert.Contains(t, engineInput, "local answer", "the engine member must see the local member's turn")
	assert.Contains(t, engineInput, "hi")
}

func TestMixedTeam_A2AMemberReceivesTranscript(t *testing.T) {
	h := mixedTeamFixture(t, "mixed-a2a-team", arkv1alpha1.TeamSpec{
		Strategy: "sequential",
		Members: []arkv1alpha1.TeamMember{
			{Type: MemberTypeAgent, Name: "local-member"},
			{Type: MemberTypeAgent, Name: "a2a-member"},
		},
	})

	result, err := h.team.Execute(h.ctx, NewUserMessage("hi"), nil, NewNoopMemory(), nil, ExecuteOptions{})
	require.NoError(t, err)
	require.Len(t, result.Messages, 2)
	assert.Equal(t, "a2a reply", result.Messages[1].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "a2a-member", result.Messages[1].OfAssistant.Name.Value)

	captured := *h.a2aCaptured
	require.NotNil(t, captured, "the a2a member must reach the A2A server")

	a2aInput := engineInputText(t, captured)
	assert.Contains(t, a2aInput, "local answer", "the a2a member must see the local member's turn")
	assert.Contains(t, a2aInput, "# local-member:", "the transcript must attribute the turn to its member")
	assert.Contains(t, a2aInput, "hi")
}

func TestA2AMember_StandaloneInputExcludesHistory(t *testing.T) {
	h := mixedTeamFixture(t, "a2a-solo-team", arkv1alpha1.TeamSpec{
		Strategy: "sequential",
		Members:  []arkv1alpha1.TeamMember{{Type: MemberTypeAgent, Name: "a2a-member"}},
	})

	agent, ok := h.team.Members[0].(*Agent)
	require.True(t, ok, "the a2a member is an agent")

	history := []Message{NewAssistantMessage("an earlier conversation turn")}
	_, err := agent.Execute(h.ctx, NewUserMessage("hi"), history, NewNoopMemory(), nil, ExecuteOptions{})
	require.NoError(t, err)

	captured := *h.a2aCaptured
	require.NotNil(t, captured)
	assert.Equal(t, "hi", engineInputText(t, captured),
		"a standalone a2a request must carry only the current input, leaving history to the remote context")
}

func TestMixedTeam_SelectorDispatchesToEngineMember(t *testing.T) {
	h := mixedTeamFixture(t, "mixed-selector-team", arkv1alpha1.TeamSpec{
		Strategy: "selector",
		MaxTurns: intPtr(1),
		Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "selector-agent"},
	})

	selector := newMockSelectorAgent()
	selector.returnName = "engine-member"
	h.team.selectorAgent = selector

	result, err := h.team.Execute(h.ctx, NewUserMessage("hi"), nil, NewNoopMemory(), nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Equal(t, 1, selector.executeCalls)

	require.Len(t, result.Messages, 2)
	assert.Equal(t, "engine reply", result.Messages[0].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "engine-member", result.Messages[0].OfAssistant.Name.Value)
	require.NotNil(t, result.Messages[1].OfSystem)
	assert.Contains(t, result.Messages[1].OfSystem.Content.OfString.Value, "maximum turns")

	require.NotNil(t, *h.engineCaptured)
	assert.Equal(t, map[string]any{"type": "agent", "name": "engine-member"},
		capturedRef(t, *h.engineCaptured)["target"])

	prompt := selector.capturedHistory[0].OfSystem.Content.OfString.Value
	assert.Contains(t, prompt, "local-member", "both member kinds must be offered as candidates")
	assert.Contains(t, prompt, "engine-member")
}

func TestMixedTeam_GraphEdgeRoutesEngineToLocal(t *testing.T) {
	h := mixedTeamFixture(t, "mixed-graph-team", arkv1alpha1.TeamSpec{
		Strategy: "selector",
		MaxTurns: intPtr(2),
		Selector: &arkv1alpha1.TeamSelectorSpec{Agent: "selector-agent"},
		Graph: &arkv1alpha1.TeamGraphSpec{
			Edges: []arkv1alpha1.TeamGraphEdge{{From: "engine-member", To: "local-member"}},
		},
	})

	selector := newMockSelectorAgent()
	selector.returnName = "engine-member"
	h.team.selectorAgent = selector

	result, err := h.team.Execute(h.ctx, NewUserMessage("hi"), nil, NewNoopMemory(), nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Equal(t, 1, selector.executeCalls, "the single legal transition must not consult the selector")

	require.Len(t, result.Messages, 3)
	assert.Equal(t, "engine-member", result.Messages[0].OfAssistant.Name.Value)
	assert.Equal(t, "local answer", result.Messages[1].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "local-member", result.Messages[1].OfAssistant.Name.Value)
	require.NotNil(t, result.Messages[2].OfSystem)

	require.NotNil(t, *h.engineCaptured)
	assert.Equal(t, map[string]any{"type": "agent", "name": "engine-member"},
		capturedRef(t, *h.engineCaptured)["target"])
}
