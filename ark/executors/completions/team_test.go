package completions

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arkv1prealpha1 "mckinsey.com/ark/api/v1prealpha1"
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

// A sequential team accumulates its transcript and hands it to each member. An
// engine-backed member only ever sees text, so losing this would make every
// member answer the original question in isolation.
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

	// No Model exists in the cluster, and the member declares no modelRef: an
	// engine-backed member never runs the local loop, so it must not need one.
	team, err := MakeTeam(ctx, k8sClient, teamCRD, telemetrynoop.NewProvider(), eventingnoop.NewProvider())
	require.NoError(t, err)
	require.Len(t, team.Members, 1)
	assert.Equal(t, "engine-member", team.Members[0].GetName())
}
