package genai

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

type a2aStreamingTeamMember struct {
	name   string
	output []protocol.Message
	events []interface{}
}

func (m *a2aStreamingTeamMember) GetName() string        { return m.name }
func (m *a2aStreamingTeamMember) GetType() string        { return MemberTypeAgent }
func (m *a2aStreamingTeamMember) GetDescription() string { return "" }

func (m *a2aStreamingTeamMember) Execute(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

func (m *a2aStreamingTeamMember) ExecuteA2A(ctx context.Context, _ protocol.Message, _ []protocol.Message, _ MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	for _, evt := range m.events {
		if err := eventStream.StreamChunk(ctx, evt); err != nil {
			return nil, err
		}
	}
	return &ExecutionResult{A2AMessages: m.output}, nil
}

type collectingEventStream struct {
	mu     sync.Mutex
	chunks []interface{}
}

func (s *collectingEventStream) StreamChunk(_ context.Context, chunk interface{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.chunks = append(s.chunks, chunk)
	return nil
}

func (s *collectingEventStream) NotifyCompletion(_ context.Context) error { return nil }
func (s *collectingEventStream) Close() error                            { return nil }

func newTestTeam(strategy string, members []TeamMember, maxTurns *int) *Team {
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	return &Team{
		Name:              "test-team",
		Namespace:         "default",
		Strategy:          strategy,
		Members:           members,
		MaxTurns:          maxTurns,
		telemetryRecorder: tp.TeamRecorder(),
		eventingRecorder:  ep.TeamRecorder(),
	}
}

func TestTeamStreamingSequentialForwardsEvents(t *testing.T) {
	statusEvt := &protocol.TaskStatusUpdateEvent{
		Kind:   "status-update",
		TaskID: "task-1",
		Status: protocol.TaskStatus{State: protocol.TaskStateWorking},
	}
	artifactEvt := &protocol.TaskArtifactUpdateEvent{
		Kind:   "artifact-update",
		TaskID: "task-1",
		Artifact: protocol.Artifact{
			ArtifactID: "a1",
			Parts:      []protocol.Part{protocol.NewTextPart("token-1")},
		},
	}

	member := &a2aStreamingTeamMember{
		name:   "streamer",
		events: []interface{}{statusEvt, artifactEvt},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("done")}),
		},
	}

	stream := &collectingEventStream{}
	team := newTestTeam(StrategySequential, []TeamMember{member}, nil)

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("go")})
	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, stream)

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Len(t, result.A2AMessages, 1)

	assert.Len(t, stream.chunks, 2, "both streamed events should reach the event stream")
	assert.IsType(t, &protocol.TaskStatusUpdateEvent{}, stream.chunks[0])
	assert.IsType(t, &protocol.TaskArtifactUpdateEvent{}, stream.chunks[1])
}

func TestTeamStreamingSequentialMultiMemberEventOrdering(t *testing.T) {
	memberA := &a2aStreamingTeamMember{
		name: "alpha",
		events: []interface{}{
			&protocol.TaskStatusUpdateEvent{Kind: "status-update", TaskID: "task-a", Status: protocol.TaskStatus{State: protocol.TaskStateWorking}},
			&protocol.TaskArtifactUpdateEvent{Kind: "artifact-update", TaskID: "task-a", Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("alpha-token")}}},
		},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("alpha done")}),
		},
	}
	memberB := &a2aStreamingTeamMember{
		name: "beta",
		events: []interface{}{
			&protocol.TaskStatusUpdateEvent{Kind: "status-update", TaskID: "task-b", Status: protocol.TaskStatus{State: protocol.TaskStateWorking}},
		},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("beta done")}),
		},
	}

	stream := &collectingEventStream{}
	team := newTestTeam(StrategySequential, []TeamMember{memberA, memberB}, nil)

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("go")})
	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, stream)

	require.NoError(t, err)
	assert.Len(t, result.A2AMessages, 2)
	assert.Len(t, stream.chunks, 3, "sequential execution should produce events in member order")

	firstStatus := stream.chunks[0].(*protocol.TaskStatusUpdateEvent)
	assert.Equal(t, "task-a", firstStatus.TaskID, "first event should be from member alpha")

	lastStatus := stream.chunks[2].(*protocol.TaskStatusUpdateEvent)
	assert.Equal(t, "task-b", lastStatus.TaskID, "last event should be from member beta")
}

func TestTeamStreamingRoundRobinForwardsEvents(t *testing.T) {
	maxTurns := 2
	memberA := &a2aStreamingTeamMember{
		name: "alpha",
		events: []interface{}{
			&protocol.TaskArtifactUpdateEvent{Kind: "artifact-update", TaskID: "task-a", Artifact: protocol.Artifact{ArtifactID: "a1", Parts: []protocol.Part{protocol.NewTextPart("alpha")}}},
		},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("alpha")}),
		},
	}
	memberB := &a2aStreamingTeamMember{
		name: "beta",
		events: []interface{}{
			&protocol.TaskArtifactUpdateEvent{Kind: "artifact-update", TaskID: "task-b", Artifact: protocol.Artifact{ArtifactID: "a2", Parts: []protocol.Part{protocol.NewTextPart("beta")}}},
		},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("beta")}),
		},
	}

	stream := &collectingEventStream{}
	team := newTestTeam(StrategyRoundRobin, []TeamMember{memberA, memberB}, &maxTurns)

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("go")})
	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, stream)

	require.NoError(t, err)
	assert.Len(t, result.A2AMessages, 2)
	assert.Len(t, stream.chunks, 2, "each round-robin turn should forward its events")
}

func TestTeamStreamingCompletionSignaling(t *testing.T) {
	completedStatus := &protocol.TaskStatusUpdateEvent{
		Kind:   "status-update",
		TaskID: "task-1",
		Status: protocol.TaskStatus{State: protocol.TaskStateCompleted},
		Final:  true,
	}
	member := &a2aStreamingTeamMember{
		name:   "completer",
		events: []interface{}{completedStatus},
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("final")}),
		},
	}

	stream := &collectingEventStream{}
	team := newTestTeam(StrategySequential, []TeamMember{member}, nil)

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("go")})
	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, stream)

	require.NoError(t, err)
	require.Len(t, stream.chunks, 1)

	finalEvt := stream.chunks[0].(*protocol.TaskStatusUpdateEvent)
	assert.Equal(t, protocol.TaskStateCompleted, finalEvt.Status.State)
	assert.True(t, finalEvt.Final)
	assert.Len(t, result.A2AMessages, 1)
}

func TestTeamStreamingNilEventStreamDoesNotPanic(t *testing.T) {
	member := &a2aRecordingTeamMember{
		name: "safe",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("ok")}),
		},
	}

	team := newTestTeam(StrategySequential, []TeamMember{member}, nil)

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("go")})
	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)

	require.NoError(t, err)
	assert.Len(t, result.A2AMessages, 1)
}
