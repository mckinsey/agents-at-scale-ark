/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkann "mckinsey.com/ark/internal/annotations"
	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

func TestShouldIncludeMemberAnnotationsForA2A(t *testing.T) {
	tests := []struct {
		name             string
		agentAnnotations map[string]string
		want             bool
	}{
		{
			name:             "nil annotations",
			agentAnnotations: nil,
			want:             false,
		},
		{
			name: "valid execution-mode a2a",
			agentAnnotations: map[string]string{
				arkann.ExecutionMode: "a2a",
			},
			want: false,
		},
		{
			name: "valid execution-mode chat-completions",
			agentAnnotations: map[string]string{
				arkann.ExecutionMode: "chat-completions",
			},
			want: false,
		},
		{
			name: "invalid execution-mode only",
			agentAnnotations: map[string]string{
				arkann.ExecutionMode: "invalid",
			},
			want: false,
		},
		{
			name: "server address only",
			agentAnnotations: map[string]string{
				arkann.A2AServerAddress: "http://a2a-agent:8080",
			},
			want: true,
		},
		{
			name: "invalid execution-mode with server address still included",
			agentAnnotations: map[string]string{
				arkann.ExecutionMode:    "invalid",
				arkann.A2AServerAddress: "http://a2a-agent:8080",
			},
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldIncludeMemberAnnotationsForA2A(tt.agentAnnotations)
			if got != tt.want {
				t.Errorf("shouldIncludeMemberAnnotationsForA2A() = %v, want %v", got, tt.want)
			}
		})
	}
}

type a2aRecordingTeamMember struct {
	name        string
	output      []protocol.Message
	seenHistory []protocol.Message
}

func (m *a2aRecordingTeamMember) GetName() string {
	return m.name
}

func (m *a2aRecordingTeamMember) GetType() string {
	return MemberTypeAgent
}

func (m *a2aRecordingTeamMember) GetDescription() string {
	return ""
}

func (m *a2aRecordingTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

func (m *a2aRecordingTeamMember) ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	m.seenHistory = append([]protocol.Message{}, history...)
	return &ExecutionResult{A2AMessages: m.output}, nil
}

func TestTeamExecuteA2ASequentialPreservesPriorMemberToolPairing(t *testing.T) {
	memberOne := &a2aRecordingTeamMember{
		name: "member-one",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
				[]protocol.Part{protocol.NewTextPart("calling tool")},
				ToolCallsPayloadV1{
					Schema: A2APayloadSchemaToolCallsV1,
					ToolCalls: []ToolCallPayloadV1{
						{
							ID:        "call-1",
							Name:      "lookup",
							Arguments: `{"city":"london"}`,
						},
					},
				},
			)),
			protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
				[]protocol.Part{protocol.NewTextPart(`{"city":"london"}`)},
				ToolResultPayloadV1{
					Schema:     A2APayloadSchemaToolResultV1,
					ToolCallID: "call-1",
					Content:    `{"city":"london"}`,
				},
			)),
		},
	}
	memberTwo := &a2aRecordingTeamMember{
		name: "member-two",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("done"),
			}),
		},
	}

	team := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{memberOne, memberTwo},
	}
	telemetryProvider := telemetrynoop.NewProvider()
	eventingProvider := eventingnoop.NewProvider()
	team.telemetryRecorder = telemetryProvider.TeamRecorder()
	team.eventingRecorder = eventingProvider.TeamRecorder()

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Len(t, result.A2AMessages, 3)

	require.Len(t, memberTwo.seenHistory, 2)
	assistantAsCompat, err := A2AToOpenAIMessage(memberTwo.seenHistory[0])
	require.NoError(t, err)
	require.NotNil(t, assistantAsCompat.OfAssistant)
	require.Len(t, assistantAsCompat.OfAssistant.ToolCalls, 1)
	assert.Equal(t, "call-1", assistantAsCompat.OfAssistant.ToolCalls[0].ID)

	toolAsCompat, err := A2AToOpenAIMessage(memberTwo.seenHistory[1])
	require.NoError(t, err)
	require.NotNil(t, toolAsCompat.OfTool)
	assert.Equal(t, "call-1", toolAsCompat.OfTool.ToolCallID)
}
