/* Copyright 2025. McKinsey & Company */

package mock

import (
	"context"
	"sync"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

// MockTracer captures all tracing operations for test assertions.
type MockTracer struct {
	mu    sync.Mutex
	Spans []*MockSpan
}

// NewTracer creates a new mock tracer.
func NewTracer() *MockTracer {
	return &MockTracer{
		Spans: make([]*MockSpan, 0),
	}
}

func (t *MockTracer) Start(ctx context.Context, spanName string, opts ...telemetry.SpanOption) (context.Context, telemetry.Span) {
	cfg := &telemetry.SpanConfig{}
	for _, opt := range opts {
		opt.ApplySpanOption(cfg)
	}

	span := &MockSpan{
		Name:       spanName,
		Attributes: make(map[string]interface{}),
		Events:     make([]MockEvent, 0),
		Config:     cfg,
	}

	t.mu.Lock()
	t.Spans = append(t.Spans, span)
	t.mu.Unlock()

	return ctx, span
}

// Reset clears all captured spans.
func (t *MockTracer) Reset() {
	t.mu.Lock()
	t.Spans = make([]*MockSpan, 0)
	t.mu.Unlock()
}

// FindSpan returns the first span with the given name, or nil if not found.
func (t *MockTracer) FindSpan(name string) *MockSpan {
	t.mu.Lock()
	defer t.mu.Unlock()

	for _, span := range t.Spans {
		if span.Name == name {
			return span
		}
	}
	return nil
}

// MockSpan captures span operations for test assertions.
type MockSpan struct {
	mu         sync.Mutex
	Name       string
	Attributes map[string]interface{}
	Events     []MockEvent
	Errors     []error
	Status     telemetry.Status
	StatusDesc string
	Ended      bool
	Config     *telemetry.SpanConfig
}

// MockEvent represents a recorded event.
type MockEvent struct {
	Name       string
	Attributes map[string]interface{}
}

func (s *MockSpan) End() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Ended = true
}

func (s *MockSpan) SetAttributes(attributes ...telemetry.Attribute) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, attr := range attributes {
		s.Attributes[attr.Key] = attr.Value
	}
}

func (s *MockSpan) RecordError(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Errors = append(s.Errors, err)
	s.Status = telemetry.StatusError
	s.StatusDesc = err.Error()
}

func (s *MockSpan) SetStatus(status telemetry.Status, description string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.Status = status
	s.StatusDesc = description
}

func (s *MockSpan) AddEvent(name string, attributes ...telemetry.Attribute) {
	s.mu.Lock()
	defer s.mu.Unlock()

	event := MockEvent{
		Name:       name,
		Attributes: make(map[string]interface{}),
	}

	for _, attr := range attributes {
		event.Attributes[attr.Key] = attr.Value
	}

	s.Events = append(s.Events, event)
}

func (s *MockSpan) TraceID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Return mock trace ID for testing
	if traceID, ok := s.Attributes["mock.traceId"].(string); ok {
		return traceID
	}
	return "mock-trace-id-123"
}

func (s *MockSpan) SpanID() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Return mock span ID for testing
	if spanID, ok := s.Attributes["mock.spanId"].(string); ok {
		return spanID
	}
	return "mock-span-id-456"
}

// GetAttribute returns the value of an attribute, or nil if not found.
func (s *MockSpan) GetAttribute(key string) interface{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Attributes[key]
}

// GetAttributeString returns the string value of an attribute.
func (s *MockSpan) GetAttributeString(key string) string {
	if val := s.GetAttribute(key); val != nil {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

// GetAttributeInt64 returns the int64 value of an attribute.
func (s *MockSpan) GetAttributeInt64(key string) int64 {
	if val := s.GetAttribute(key); val != nil {
		if i64, ok := val.(int64); ok {
			return i64
		}
	}
	return 0
}

// HasAttribute checks if an attribute with the given key exists.
func (s *MockSpan) HasAttribute(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.Attributes[key]
	return ok
}

// MockQueryRecorder captures query recorder operations for test assertions.
type MockQueryRecorder struct {
	Tracer *MockTracer
}

// NewQueryRecorder creates a new mock query recorder.
func NewQueryRecorder(tracer *MockTracer) *MockQueryRecorder {
	if tracer == nil {
		tracer = NewTracer()
	}
	return &MockQueryRecorder{
		Tracer: tracer,
	}
}

func (r *MockQueryRecorder) StartQuery(ctx context.Context, query *arkv1alpha1.Query, phase string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "query."+phase,
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrQueryName, query.Name),
			telemetry.String(telemetry.AttrQueryNamespace, query.Namespace),
			telemetry.String(telemetry.AttrQueryPhase, phase),
		),
	)
}

func (r *MockQueryRecorder) StartTarget(ctx context.Context, targetType, targetName string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "query."+targetType,
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrTargetType, targetType),
			telemetry.String(telemetry.AttrTargetName, targetName),
		),
	)
}

func (r *MockQueryRecorder) RecordRootInput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryRootInput, content))
}

func (r *MockQueryRecorder) RecordRootOutput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryRootOutput, content))
}

func (r *MockQueryRecorder) RecordInput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryInput, content))
}

func (r *MockQueryRecorder) RecordOutput(span telemetry.Span, content string) {
	span.SetAttributes(telemetry.String(telemetry.AttrQueryOutput, content))
}

func (r *MockQueryRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *MockQueryRecorder) RecordSessionID(span telemetry.Span, sessionID string) {
	if sessionID != "" {
		span.SetAttributes(telemetry.String(telemetry.AttrSessionID, sessionID))
	}
}

func (r *MockQueryRecorder) RecordConversationID(span telemetry.Span, conversationID string) {
	if conversationID != "" {
		span.SetAttributes(telemetry.String(telemetry.AttrConversationID, conversationID))
	}
}

func (r *MockQueryRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *MockQueryRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}

// MockAgentRecorder implements telemetry.AgentRecorder for testing.
type MockAgentRecorder struct {
	Tracer *MockTracer
}

// NewAgentRecorder creates a new mock agent recorder with an embedded mock tracer.
func NewAgentRecorder() *MockAgentRecorder {
	return &MockAgentRecorder{
		Tracer: NewTracer(),
	}
}

func (r *MockAgentRecorder) StartAgentExecution(ctx context.Context, agentName, namespace string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "agent.execution",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrAgentName, agentName),
			telemetry.String(telemetry.AttrQueryNamespace, namespace),
		),
	)
}

func (r *MockAgentRecorder) StartLLMCall(ctx context.Context, modelName string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "llm.call",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrModelName, modelName),
		),
	)
}

func (r *MockAgentRecorder) StartToolCall(ctx context.Context, toolName, toolType, toolID, arguments string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "tool.execution",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrToolName, toolName),
			telemetry.String(telemetry.AttrToolType, toolType),
			telemetry.String("tool.id", toolID),
			telemetry.String(telemetry.AttrToolInput, arguments),
		),
	)
}

func (r *MockAgentRecorder) RecordToolResult(span telemetry.Span, result string) {
	span.SetAttributes(telemetry.String(telemetry.AttrToolOutput, result))
}

func (r *MockAgentRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *MockAgentRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *MockAgentRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}

type MockTeamRecorder struct {
	Tracer *MockTracer
}

func NewTeamRecorder() *MockTeamRecorder {
	return &MockTeamRecorder{
		Tracer: NewTracer(),
	}
}

func (r *MockTeamRecorder) StartTeamExecution(ctx context.Context, teamName, namespace, strategy string, memberCount, maxTurns int) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "team.execution",
		telemetry.WithAttributes(
			telemetry.String(telemetry.AttrTeamName, teamName),
			telemetry.String(telemetry.AttrQueryNamespace, namespace),
			telemetry.String("team.strategy", strategy),
			telemetry.Int("team.member_count", memberCount),
			telemetry.Int("team.max_turns", maxTurns),
		),
	)
}

func (r *MockTeamRecorder) StartTurn(ctx context.Context, turn int, memberName, memberType string) (context.Context, telemetry.Span) {
	return r.Tracer.Start(ctx, "team.turn",
		telemetry.WithAttributes(
			telemetry.Int("turn.number", turn),
			telemetry.String("turn.member.name", memberName),
			telemetry.String("turn.member.type", memberType),
		),
	)
}

func (r *MockTeamRecorder) RecordTurnOutput(span telemetry.Span, messages any, messageCount int) {
	span.SetAttributes(
		telemetry.Int("turn.output_message_count", messageCount),
	)
}

func (r *MockTeamRecorder) RecordTokenUsage(span telemetry.Span, promptTokens, completionTokens, totalTokens int64) {
	span.SetAttributes(
		telemetry.Int64(telemetry.AttrTokensPrompt, promptTokens),
		telemetry.Int64(telemetry.AttrTokensCompletion, completionTokens),
		telemetry.Int64(telemetry.AttrTokensTotal, totalTokens),
	)
}

func (r *MockTeamRecorder) RecordSuccess(span telemetry.Span) {
	span.SetStatus(telemetry.StatusOk, "success")
}

func (r *MockTeamRecorder) RecordError(span telemetry.Span, err error) {
	span.RecordError(err)
}
