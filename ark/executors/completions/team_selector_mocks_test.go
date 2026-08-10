package completions

import (
	"context"

	"github.com/openai/openai-go"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	eventnoop "mckinsey.com/ark/internal/eventing/noop"
	"mckinsey.com/ark/internal/telemetry"
	"mckinsey.com/ark/internal/telemetry/noop"
)

type mockTeamMember struct {
	name        string
	description string
	memberType  string
}

func (m *mockTeamMember) GetName() string {
	return m.name
}

func (m *mockTeamMember) GetDescription() string {
	return m.description
}

func (m *mockTeamMember) GetType() string {
	if m.memberType == "" {
		return MemberTypeAgent
	}
	return m.memberType
}

func (m *mockTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

type mockSelectorAgent struct {
	returnName              string
	returnEmpty             bool
	returnTerminateResponse string
	returnError             error
	capturedHistory         []Message
	capturedOptions         ExecuteOptions
	executeCalls            int
	tools                   *ToolRegistry
}

func newMockSelectorAgent() *mockSelectorAgent {
	return &mockSelectorAgent{
		returnName: "selected",
		tools:      NewToolRegistry(nil, noop.NewProvider().ToolRecorder(), eventnoop.NewProvider().ToolRecorder()),
	}
}

func (m *mockSelectorAgent) Execute(_ context.Context, _ Message, history []Message, _ MemoryInterface, _ EventStreamInterface, opts ExecuteOptions) (*ExecutionResult, error) {
	m.capturedHistory = history
	m.capturedOptions = opts
	m.executeCalls++
	if m.returnError != nil {
		return nil, m.returnError
	}
	if m.returnEmpty {
		return &ExecutionResult{Messages: []Message{}}, nil
	}
	if m.returnTerminateResponse != "" {
		assistantMsg := Message(openai.ChatCompletionMessageParamUnion{
			OfAssistant: &openai.ChatCompletionAssistantMessageParam{
				Name: openai.String("mock-selector"),
				ToolCalls: []openai.ChatCompletionMessageToolCallParam{
					{
						ID: "tool-call-id",
						Function: openai.ChatCompletionMessageToolCallFunctionParam{
							Name:      "terminate",
							Arguments: `{"response":"` + m.returnTerminateResponse + `"}`,
						},
					},
				},
			},
		})
		toolMsg := ToolMessage(m.returnTerminateResponse, "tool-call-id")
		return &ExecutionResult{
			Messages: []Message{assistantMsg, toolMsg},
			Signal:   &TerminateSignal{},
		}, nil
	}
	return &ExecutionResult{
		Messages: []Message{
			NewAssistantMessage(m.returnName),
		},
		Signal: &SelectionMadeSignal{SelectedName: m.returnName},
	}, nil
}

func (m *mockSelectorAgent) FullName() string {
	return "mock-selector"
}

func (m *mockSelectorAgent) GetToolRegistry() *ToolRegistry {
	return m.tools
}

type mockSelectorAgentNoTool struct {
	tools *ToolRegistry
}

func (m *mockSelectorAgentNoTool) Execute(_ context.Context, _ Message, _ []Message, _ MemoryInterface, _ EventStreamInterface, _ ExecuteOptions) (*ExecutionResult, error) {
	return &ExecutionResult{Messages: []Message{NewAssistantMessage("I pick researcher")}}, nil
}

func (m *mockSelectorAgentNoTool) FullName() string {
	return "mock-selector-no-tool"
}

func (m *mockSelectorAgentNoTool) GetToolRegistry() *ToolRegistry {
	return m.tools
}

type mockTelemetrySpan struct {
	ended      bool
	errorSet   bool
	successSet bool
}

func (m *mockTelemetrySpan) End() {
	m.ended = true
}

func (m *mockTelemetrySpan) SetAttributes(attributes ...telemetry.Attribute) {}

func (m *mockTelemetrySpan) RecordError(err error) {
	m.errorSet = true
}

func (m *mockTelemetrySpan) SetStatus(status telemetry.Status, description string) {
	if status == telemetry.StatusOk {
		m.successSet = true
	}
}

func (m *mockTelemetrySpan) AddEvent(name string, attributes ...telemetry.Attribute) {}

func (m *mockTelemetrySpan) TraceID() string {
	return "mock-trace-id"
}

func (m *mockTelemetrySpan) SpanID() string {
	return "mock-span-id"
}

type mockTeamRecorder struct {
	startTurnCalled        bool
	recordOutputCalled     bool
	recordErrorCalled      bool
	recordSuccessCalled    bool
	lastTurn               int
	lastMemberName         string
	lastMemberType         string
	lastOutputMessageCount int
	lastOutput             string
}

func (m *mockTeamRecorder) StartTeamExecution(ctx context.Context, teamName, namespace, strategy string, memberCount, maxTurns int) (context.Context, telemetry.Span) {
	return ctx, &mockTelemetrySpan{}
}

func (m *mockTeamRecorder) StartTurn(ctx context.Context, turn int, memberName, memberType string) (context.Context, telemetry.Span) {
	m.startTurnCalled = true
	m.lastTurn = turn
	m.lastMemberName = memberName
	m.lastMemberType = memberType
	return ctx, &mockTelemetrySpan{}
}

func (m *mockTeamRecorder) RecordTurnOutput(span telemetry.Span, output string, messageCount int) {
	m.recordOutputCalled = true
	m.lastOutputMessageCount = messageCount
	m.lastOutput = output
}

func (m *mockTeamRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
}

func (m *mockTeamRecorder) RecordError(span telemetry.Span, err error) {
	m.recordErrorCalled = true
}

func (m *mockTeamRecorder) RecordSuccess(span telemetry.Span) {
	m.recordSuccessCalled = true
}

type mockEventingRecorder struct {
	startCalled                bool
	completeCalled             bool
	failCalled                 bool
	startTokenCollectionCalled bool
	lastOperation              string
	lastMessage                string
	lastError                  error
}

func (m *mockEventingRecorder) InitializeQueryContext(ctx context.Context, query *arkv1alpha1.Query) context.Context {
	return ctx
}

func (m *mockEventingRecorder) Start(ctx context.Context, operation, message string, data map[string]string) context.Context {
	m.startCalled = true
	m.lastOperation = operation
	m.lastMessage = message
	return ctx
}

func (m *mockEventingRecorder) Complete(ctx context.Context, operation, message string, data map[string]string) {
	m.completeCalled = true
	m.lastOperation = operation
	m.lastMessage = message
}

func (m *mockEventingRecorder) Cancel(ctx context.Context, operation, message string, data map[string]string) {
	m.lastOperation = operation
	m.lastMessage = message
}

func (m *mockEventingRecorder) Fail(ctx context.Context, operation, message string, err error, data map[string]string) {
	m.failCalled = true
	m.lastOperation = operation
	m.lastMessage = message
	m.lastError = err
}

func (m *mockEventingRecorder) StartTokenCollection(ctx context.Context) context.Context {
	m.startTokenCollectionCalled = true
	return ctx
}

func (m *mockEventingRecorder) AddTokens(ctx context.Context, promptTokens, completionTokens, totalTokens, cachedTokens int64) {
}

func (m *mockEventingRecorder) AddTokenUsage(ctx context.Context, usage arkv1alpha1.TokenUsage) {}

func (m *mockEventingRecorder) AddCompletionUsage(ctx context.Context, usage openai.CompletionUsage) {
}

func (m *mockEventingRecorder) GetTokenSummary(ctx context.Context) arkv1alpha1.TokenUsage {
	return arkv1alpha1.TokenUsage{}
}
