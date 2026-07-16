package completions

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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

func TestExecuteGraph_RecordsTurnOutput(t *testing.T) {
	members := []TeamMember{
		&execMockTeamMember{
			name: "m1",
			execFunc: func(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
				return &ExecutionResult{Messages: []Message{NewAssistantMessage("graph response")}}, nil
			},
		},
	}
	team := newTestTeam(members, "graph", false, nil)
	rec := &mockTeamRecorder{}
	team.telemetryRecorder = rec

	result, err := team.Execute(context.Background(), NewUserMessage("hello"), nil, nil, nil, ExecuteOptions{})
	require.NoError(t, err)
	assert.Len(t, result.Messages, 1)
	assert.True(t, rec.recordOutputCalled)
	assert.Equal(t, "graph response", rec.lastOutput)
}
