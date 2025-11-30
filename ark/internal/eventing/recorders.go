package eventing

import (
	"context"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/runtime"
	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type OperationTracker interface {
	InitializeQueryContext(ctx context.Context, query *arkv1alpha1.Query) context.Context
	Start(ctx context.Context, operation, message string, data map[string]string) context.Context
	Complete(ctx context.Context, operation, message string, data map[string]string)
	Fail(ctx context.Context, operation, message string, err error, data map[string]string)
}

type TokenCollector interface {
	StartTokenCollection(ctx context.Context) context.Context
	AddTokens(ctx context.Context, promptTokens, completionTokens, totalTokens int64)
	AddTokenUsage(ctx context.Context, usage arkv1alpha1.TokenUsage)
	AddCompletionUsage(ctx context.Context, usage openai.CompletionUsage)
	GetTokenSummary(ctx context.Context) arkv1alpha1.TokenUsage
}

type ModelRecorder interface {
	OperationTracker
	TokenCollector
	ModelUnavailable(ctx context.Context, model runtime.Object, reason string)
}

type A2aRecorder interface {
	OperationTracker
	AgentCreationFailed(ctx context.Context, obj runtime.Object, reason string)
	AgentDeletionFailed(ctx context.Context, obj runtime.Object, reason string)
	AgentDiscoveryFailed(ctx context.Context, obj runtime.Object, reason string)
	TaskPollingFailed(ctx context.Context, obj runtime.Object, reason string)
	A2AMessageFailed(ctx context.Context, reason string)
	A2AConnectionFailed(ctx context.Context, reason string)
	A2AHeaderResolutionFailed(ctx context.Context, reason string)
	A2AResponseParseError(ctx context.Context, reason string)
}

type AgentRecorder interface {
	OperationTracker
	DependencyUnavailable(ctx context.Context, obj runtime.Object, reason string)
}

type ExecutionEngineRecorder interface {
	OperationTracker
	AddressResolutionFailed(ctx context.Context, obj runtime.Object, reason string)
}

type MCPServerRecorder interface {
	AddressResolutionFailed(ctx context.Context, obj runtime.Object, reason string)
	ClientCreationFailed(ctx context.Context, obj runtime.Object, reason string)
	ToolListingFailed(ctx context.Context, obj runtime.Object, reason string)
	ToolCreationFailed(ctx context.Context, obj runtime.Object, reason string)
}

type TeamRecorder interface {
	OperationTracker
	TokenCollector
}

type QueryRecorder interface {
	OperationTracker
	TokenCollector
	QueryParameterResolutionFailed(ctx context.Context, obj runtime.Object, parameterName, reason string)
	QueryParameterNotFound(ctx context.Context, obj runtime.Object, parameterName string)
}

type ToolRecorder interface {
	OperationTracker
}

type MemoryRecorder interface {
	OperationTracker
}

type Provider interface {
	ModelRecorder() ModelRecorder
	A2aRecorder() A2aRecorder
	AgentRecorder() AgentRecorder
	TeamRecorder() TeamRecorder
	ExecutionEngineRecorder() ExecutionEngineRecorder
	MCPServerRecorder() MCPServerRecorder
	QueryRecorder() QueryRecorder
	ToolRecorder() ToolRecorder
	MemoryRecorder() MemoryRecorder
}
