/* Copyright 2025. McKinsey & Company */

package genai

import (
	"context"
	"errors"
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

type a2aErroringTeamMember struct {
	name   string
	output []protocol.Message
	err    error
}

func (m *a2aErroringTeamMember) GetName() string {
	return m.name
}

func (m *a2aErroringTeamMember) GetType() string {
	return MemberTypeAgent
}

func (m *a2aErroringTeamMember) GetDescription() string {
	return ""
}

func (m *a2aErroringTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

func (m *a2aErroringTeamMember) ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{A2AMessages: m.output}, m.err
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

func TestTeamExecuteA2ASequentialFullHistoryHandoff(t *testing.T) {
	msg1 := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("first response"),
	})
	msg2 := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("second response"),
	})
	msg3 := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("third response"),
	})

	memberOne := &a2aRecordingTeamMember{
		name:   "member-one",
		output: []protocol.Message{msg1, msg2, msg3},
	}
	memberTwo := &a2aRecordingTeamMember{
		name: "member-two",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("final"),
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
	require.Len(t, result.A2AMessages, 4, "total messages = 3 from member-one + 1 from member-two")

	require.Len(t, memberTwo.seenHistory, 3, "member-two must see all 3 messages from member-one")
	assert.Equal(t, ExtractA2ATextFromMessage(memberTwo.seenHistory[0]), "first response")
	assert.Equal(t, ExtractA2ATextFromMessage(memberTwo.seenHistory[1]), "second response")
	assert.Equal(t, ExtractA2ATextFromMessage(memberTwo.seenHistory[2]), "third response")
}

func TestTeamExecuteA2ASequentialToolCallPairIntegrity(t *testing.T) {
	memberOne := &a2aRecordingTeamMember{
		name: "member-one",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
				[]protocol.Part{protocol.NewTextPart("calling tools")},
				ToolCallsPayloadV1{
					Schema: A2APayloadSchemaToolCallsV1,
					ToolCalls: []ToolCallPayloadV1{
						{ID: "call-1", Name: "lookup", Arguments: `{"city":"london"}`},
						{ID: "call-2", Name: "weather", Arguments: `{"city":"paris"}`},
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
			protocol.NewMessage(protocol.MessageRoleAgent, appendPayloadPart(
				[]protocol.Part{protocol.NewTextPart(`{"city":"paris"}`)},
				ToolResultPayloadV1{
					Schema:     A2APayloadSchemaToolResultV1,
					ToolCallID: "call-2",
					Content:    `{"city":"paris"}`,
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
	require.Len(t, result.A2AMessages, 4)

	require.Len(t, memberTwo.seenHistory, 3, "member-two must see tool-call + 2 tool-results from member-one")

	assistantAsCompat, err := A2AToOpenAIMessage(memberTwo.seenHistory[0])
	require.NoError(t, err)
	require.NotNil(t, assistantAsCompat.OfAssistant)
	require.Len(t, assistantAsCompat.OfAssistant.ToolCalls, 2)
	assert.Equal(t, "call-1", assistantAsCompat.OfAssistant.ToolCalls[0].ID)
	assert.Equal(t, "call-2", assistantAsCompat.OfAssistant.ToolCalls[1].ID)

	tool1AsCompat, err := A2AToOpenAIMessage(memberTwo.seenHistory[1])
	require.NoError(t, err)
	require.NotNil(t, tool1AsCompat.OfTool)
	assert.Equal(t, "call-1", tool1AsCompat.OfTool.ToolCallID)

	tool2AsCompat, err := A2AToOpenAIMessage(memberTwo.seenHistory[2])
	require.NoError(t, err)
	require.NotNil(t, tool2AsCompat.OfTool)
	assert.Equal(t, "call-2", tool2AsCompat.OfTool.ToolCallID)
}

func TestTeamExecuteA2ASequentialMultiTurnAccumulation(t *testing.T) {
	turn1MemberOne := &a2aRecordingTeamMember{
		name: "member-one",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("turn1-m1"),
			}),
		},
	}
	turn1MemberTwo := &a2aRecordingTeamMember{
		name: "member-two",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("turn1-m2"),
			}),
		},
	}

	team1 := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{turn1MemberOne, turn1MemberTwo},
	}
	tp1 := telemetrynoop.NewProvider()
	ep1 := eventingnoop.NewProvider()
	team1.telemetryRecorder = tp1.TeamRecorder()
	team1.eventingRecorder = ep1.TeamRecorder()

	userInput1 := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("turn one"),
	})

	result1, err := team1.ExecuteA2A(context.Background(), userInput1, nil, nil, nil)
	require.NoError(t, err)
	require.Len(t, result1.A2AMessages, 2, "turn 1 produces 2 messages")

	turn2MemberOne := &a2aRecordingTeamMember{
		name: "member-one",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("turn2-m1"),
			}),
		},
	}
	turn2MemberTwo := &a2aRecordingTeamMember{
		name: "member-two",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("turn2-m2"),
			}),
		},
	}

	team2 := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{turn2MemberOne, turn2MemberTwo},
	}
	tp2 := telemetrynoop.NewProvider()
	ep2 := eventingnoop.NewProvider()
	team2.telemetryRecorder = tp2.TeamRecorder()
	team2.eventingRecorder = ep2.TeamRecorder()

	userInput2 := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("turn two"),
	})

	result2, err := team2.ExecuteA2A(context.Background(), userInput2, result1.A2AMessages, nil, nil)
	require.NoError(t, err)
	require.Len(t, result2.A2AMessages, 2, "turn 2 produces 2 new messages")

	require.Len(t, turn2MemberOne.seenHistory, 2, "turn 2 member-one sees full turn 1 output as history")
	assert.Equal(t, "turn1-m1", ExtractA2ATextFromMessage(turn2MemberOne.seenHistory[0]))
	assert.Equal(t, "turn1-m2", ExtractA2ATextFromMessage(turn2MemberOne.seenHistory[1]))

	require.Len(t, turn2MemberTwo.seenHistory, 3, "turn 2 member-two sees turn 1 output + turn 2 member-one output")
	assert.Equal(t, "turn1-m1", ExtractA2ATextFromMessage(turn2MemberTwo.seenHistory[0]))
	assert.Equal(t, "turn1-m2", ExtractA2ATextFromMessage(turn2MemberTwo.seenHistory[1]))
	assert.Equal(t, "turn2-m1", ExtractA2ATextFromMessage(turn2MemberTwo.seenHistory[2]))
}

func TestTeamExecuteA2ASequentialPreservesPartialMessagesOnError(t *testing.T) {
	member := &a2aErroringTeamMember{
		name: "member-one",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("partial response"),
			}),
		},
		err: errors.New("member failure"),
	}

	team := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{member},
	}
	telemetryProvider := telemetrynoop.NewProvider()
	eventingProvider := eventingnoop.NewProvider()
	team.telemetryRecorder = telemetryProvider.TeamRecorder()
	team.eventingRecorder = eventingProvider.TeamRecorder()

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)
	require.Error(t, err)
	require.NotNil(t, result)
	require.Len(t, result.A2AMessages, 1)
	assert.Equal(t, "partial response", ExtractA2ATextFromMessage(result.A2AMessages[0]))
}

func TestStampAgentNameOnMessages(t *testing.T) {
	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("hello"),
		}),
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
			protocol.NewTextPart("world"),
		}),
	}

	stampAgentNameOnMessages(messages, "researcher")

	for _, msg := range messages {
		require.Contains(t, msg.Extensions, A2ATeamExtensionKey)
		ext, ok := getTeamExtension(msg)
		require.True(t, ok)
		assert.Equal(t, "researcher", ext.AgentName)
	}
}

func TestStampAgentNameOnMessagesPreservesExistingMetadata(t *testing.T) {
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("hello"),
	})
	msg.Metadata = map[string]interface{}{"existing": "value"}
	messages := []protocol.Message{msg}

	stampAgentNameOnMessages(messages, "writer")

	ext, ok := getTeamExtension(messages[0])
	require.True(t, ok)
	assert.Equal(t, "writer", ext.AgentName)
	assert.Equal(t, "value", messages[0].Metadata["existing"])
}

func TestStampAgentNameOnMessagesSkipsEmptyName(t *testing.T) {
	msg := protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
		protocol.NewTextPart("hello"),
	})
	messages := []protocol.Message{msg}

	stampAgentNameOnMessages(messages, "")

	assert.Nil(t, messages[0].Metadata)
}

func TestTeamExecuteA2ASequentialStampsAgentNames(t *testing.T) {
	memberOne := &a2aRecordingTeamMember{
		name: "researcher",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("research results"),
			}),
		},
	}
	memberTwo := &a2aRecordingTeamMember{
		name: "writer",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("written content"),
			}),
		},
	}

	team := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{memberOne, memberTwo},
	}
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	team.telemetryRecorder = tp.TeamRecorder()
	team.eventingRecorder = ep.TeamRecorder()

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)
	require.NoError(t, err)
	require.Len(t, result.A2AMessages, 2)

	assert.Equal(t, "researcher", getAgentNameFromMessage(result.A2AMessages[0]))
	assert.Equal(t, "writer", getAgentNameFromMessage(result.A2AMessages[1]))
}

func TestTeamExecuteA2ASequentialStampsAgentNamesOnPartialError(t *testing.T) {
	member := &a2aErroringTeamMember{
		name: "failing-agent",
		output: []protocol.Message{
			protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{
				protocol.NewTextPart("partial"),
			}),
		},
		err: errors.New("member failure"),
	}

	team := &Team{
		Name:      "team",
		Namespace: "default",
		Strategy:  StrategySequential,
		Members:   []TeamMember{member},
	}
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	team.telemetryRecorder = tp.TeamRecorder()
	team.eventingRecorder = ep.TeamRecorder()

	userInput := protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{
		protocol.NewTextPart("hello"),
	})

	result, err := team.ExecuteA2A(context.Background(), userInput, nil, nil, nil)
	require.Error(t, err)
	require.NotNil(t, result)
	require.Len(t, result.A2AMessages, 1)
	assert.Equal(t, "failing-agent", getAgentNameFromMessage(result.A2AMessages[0]))
}
