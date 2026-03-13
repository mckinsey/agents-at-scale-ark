package completions

import (
	"context"
	"testing"

	"github.com/openai/openai-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
)

type recordingTeamMember struct {
	name        string
	description string
	response    []Message
	seenHistory []Message
}

func (m *recordingTeamMember) Execute(_ context.Context, _ Message, history []Message, _ MemoryInterface, _ EventStreamInterface) (*ExecutionResult, error) {
	m.seenHistory = append([]Message{}, history...)
	return &ExecutionResult{Messages: append([]Message{}, m.response...)}, nil
}

func (m *recordingTeamMember) GetName() string {
	return m.name
}

func (m *recordingTeamMember) GetType() string {
	return MemberTypeAgent
}

func (m *recordingTeamMember) GetDescription() string {
	return m.description
}

type noopEventingTeamRecorder struct{}

func (noopEventingTeamRecorder) InitializeQueryContext(ctx context.Context, _ *arkv1alpha1.Query) context.Context {
	return ctx
}

func (noopEventingTeamRecorder) Start(ctx context.Context, _ string, _ string, _ map[string]string) context.Context {
	return ctx
}

func (noopEventingTeamRecorder) Complete(_ context.Context, _ string, _ string, _ map[string]string) {}

func (noopEventingTeamRecorder) Fail(_ context.Context, _ string, _ string, _ error, _ map[string]string) {}

func (noopEventingTeamRecorder) StartTokenCollection(ctx context.Context) context.Context {
	return ctx
}

func (noopEventingTeamRecorder) AddTokens(_ context.Context, _ int64, _ int64, _ int64) {}

func (noopEventingTeamRecorder) AddTokenUsage(_ context.Context, _ arkv1alpha1.TokenUsage) {}

func (noopEventingTeamRecorder) AddCompletionUsage(_ context.Context, _ openai.CompletionUsage) {}

func (noopEventingTeamRecorder) GetTokenSummary(_ context.Context) arkv1alpha1.TokenUsage {
	return arkv1alpha1.TokenUsage{}
}

var _ eventing.TeamRecorder = (*noopEventingTeamRecorder)(nil)

func TestExecuteMemberAndAccumulatePassesFullHistoryToNextMember(t *testing.T) {
	team := &Team{
		Name:           "test-team",
		Strategy:       "sequential",
		eventingRecorder: noopEventingTeamRecorder{},
	}

	memberOne := &recordingTeamMember{
		name:     "member-one",
		response: []Message{NewAssistantMessage("first reply")},
	}
	memberTwo := &recordingTeamMember{
		name:     "member-two",
		response: []Message{NewAssistantMessage("second reply")},
	}

	messages := []Message{NewUserMessage("question")}
	newMessages := []Message{}

	err := team.executeMemberAndAccumulate(context.Background(), memberOne, NewUserMessage("question"), &messages, &newMessages, 0)
	require.NoError(t, err)

	err = team.executeMemberAndAccumulate(context.Background(), memberTwo, NewUserMessage("question"), &messages, &newMessages, 1)
	require.NoError(t, err)

	require.Len(t, memberTwo.seenHistory, 2)
	assert.Equal(t, "question", memberTwo.seenHistory[0].OfUser.Content.OfString.Value)
	assert.Equal(t, "first reply", memberTwo.seenHistory[1].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "member-one", memberTwo.seenHistory[1].OfAssistant.Name.Value)
}

func TestExecuteMemberAndAccumulatePreservesHistoryOrderAcrossTurns(t *testing.T) {
	team := &Team{
		Name:           "test-team",
		Strategy:       "sequential",
		eventingRecorder: noopEventingTeamRecorder{},
	}

	memberOne := &recordingTeamMember{
		name: "member-one",
		response: []Message{
			NewAssistantMessage("step one"),
			NewAssistantMessage("step two"),
		},
	}
	memberTwo := &recordingTeamMember{
		name:     "member-two",
		response: []Message{NewAssistantMessage("final")},
	}

	messages := []Message{NewUserMessage("root input")}
	newMessages := []Message{}

	err := team.executeMemberAndAccumulate(context.Background(), memberOne, NewUserMessage("root input"), &messages, &newMessages, 0)
	require.NoError(t, err)

	err = team.executeMemberAndAccumulate(context.Background(), memberTwo, NewUserMessage("root input"), &messages, &newMessages, 1)
	require.NoError(t, err)

	require.Len(t, memberTwo.seenHistory, 3)
	assert.Equal(t, "root input", memberTwo.seenHistory[0].OfUser.Content.OfString.Value)
	assert.Equal(t, "step one", memberTwo.seenHistory[1].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "step two", memberTwo.seenHistory[2].OfAssistant.Content.OfString.Value)
	assert.Equal(t, "member-one", memberTwo.seenHistory[1].OfAssistant.Name.Value)
	assert.Equal(t, "member-one", memberTwo.seenHistory[2].OfAssistant.Name.Value)
}
