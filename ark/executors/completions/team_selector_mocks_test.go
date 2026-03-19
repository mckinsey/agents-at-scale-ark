package completions

import (
	"context"

	"github.com/openai/openai-go"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
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

func (m *mockTeamMember) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	return &ExecutionResult{}, nil
}

type mockSelectorAgent struct {
	returnName  string
	returnEmpty bool
}

func newMockSelectorAgent() *mockSelectorAgent {
	return &mockSelectorAgent{returnName: "selected"}
}

func (m *mockSelectorAgent) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if m.returnEmpty {
		return &ExecutionResult{Messages: []Message{}}, nil
	}
	return &ExecutionResult{
		Messages: []Message{
			NewAssistantMessage(m.returnName),
		},
	}, nil
}

func (m *mockSelectorAgent) FullName() string {
	return "mock-selector"
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

func (m *mockTeamRecorder) RecordTurnOutput(span telemetry.Span, messages any, messageCount int) {
	m.recordOutputCalled = true
	m.lastOutputMessageCount = messageCount
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

func (m *mockEventingRecorder) AddTokens(ctx context.Context, promptTokens, completionTokens, totalTokens int64) {
}

func (m *mockEventingRecorder) AddTokenUsage(ctx context.Context, usage arkv1alpha1.TokenUsage) {}

func (m *mockEventingRecorder) AddCompletionUsage(ctx context.Context, usage openai.CompletionUsage) {
}

func (m *mockEventingRecorder) GetTokenSummary(ctx context.Context) arkv1alpha1.TokenUsage {
	return arkv1alpha1.TokenUsage{}
}
