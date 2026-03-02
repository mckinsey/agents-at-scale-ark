package genai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	eventingnoop "mckinsey.com/ark/internal/eventing/noop"
	telemetrynoop "mckinsey.com/ark/internal/telemetry/noop"
)

type fakeGeminiProvider struct {
	response *GeminiGenerateResponse
	err      error
	lastReq  GeminiGenerateRequest
}

func (f *fakeGeminiProvider) GenerateContent(_ context.Context, req GeminiGenerateRequest) (*GeminiGenerateResponse, error) {
	f.lastReq = req
	return f.response, f.err
}

func newTestGeminiAdapter(provider GeminiContentProvider) A2AModelProvider {
	tp := telemetrynoop.NewProvider()
	ep := eventingnoop.NewProvider()
	return NewGeminiA2AModelAdapter(provider, "gemini-2.0-flash", "test-agent", tp.ModelRecorder(), ep.ModelRecorder())
}

func TestGeminiA2AModelAdapterBasicTurn(t *testing.T) {
	provider := &fakeGeminiProvider{
		response: &GeminiGenerateResponse{
			Candidates: []GeminiCandidate{{
				Content: GeminiContent{
					Role:  "model",
					Parts: []GeminiPart{{Text: "Hello from Gemini"}},
				},
			}},
			UsageMetadata: &GeminiUsage{PromptTokenCount: 8, CandidatesTokenCount: 4, TotalTokenCount: 12},
		},
	}
	adapter := newTestGeminiAdapter(provider)

	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleUser, []protocol.Part{protocol.NewTextPart("Hi")}),
	}

	result, err := adapter.A2ATurn(context.Background(), messages, nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, "Hello from Gemini", result.Content)
	require.NotNil(t, result.Usage)
	assert.Equal(t, int64(8), result.Usage.PromptTokens)
	assert.Equal(t, int64(4), result.Usage.CompletionTokens)
	assert.Equal(t, int64(12), result.Usage.TotalTokens)
}

func TestGeminiA2AModelAdapterFunctionCalls(t *testing.T) {
	provider := &fakeGeminiProvider{
		response: &GeminiGenerateResponse{
			Candidates: []GeminiCandidate{{
				Content: GeminiContent{
					Role: "model",
					Parts: []GeminiPart{
						{Text: "Looking up"},
						{FunctionCall: &GeminiFunctionCall{Name: "search", Args: map[string]any{"q": "test"}}},
					},
				},
			}},
		},
	}
	adapter := newTestGeminiAdapter(provider)

	tools := []A2AToolDefinition{{Name: "search", Description: "Search", Parameters: map[string]any{"type": "object"}}}
	result, err := adapter.A2ATurn(context.Background(), nil, nil, tools, nil)

	require.NoError(t, err)
	require.Len(t, result.ToolCalls, 1)
	assert.Equal(t, "search", result.ToolCalls[0].Name)
	assert.Contains(t, result.ToolCalls[0].Arguments, "test")
	require.Len(t, provider.lastReq.Tools, 1)
	assert.Equal(t, "search", provider.lastReq.Tools[0].FunctionDeclarations[0].Name)
}

func TestGeminiA2AModelAdapterToolOutcomes(t *testing.T) {
	provider := &fakeGeminiProvider{
		response: &GeminiGenerateResponse{
			Candidates: []GeminiCandidate{{
				Content: GeminiContent{Role: "model", Parts: []GeminiPart{{Text: "Done"}}},
			}},
		},
	}
	adapter := newTestGeminiAdapter(provider)

	messages := []protocol.Message{
		protocol.NewMessage(protocol.MessageRoleAgent, []protocol.Part{protocol.NewTextPart("calling")}),
	}
	outcomes := []A2AToolOutcome{{ToolCallID: "tc-1", ToolName: "search", Content: `{"result":"42"}`}}

	_, err := adapter.A2ATurn(context.Background(), messages, outcomes, nil, nil)
	require.NoError(t, err)

	lastContent := provider.lastReq.Contents[len(provider.lastReq.Contents)-1]
	assert.Equal(t, "function", lastContent.Role)
	require.Len(t, lastContent.Parts, 1)
	require.NotNil(t, lastContent.Parts[0].FunctionResponse)
	assert.Equal(t, "search", lastContent.Parts[0].FunctionResponse.Name)
}

func TestGeminiA2AModelAdapterError(t *testing.T) {
	provider := &fakeGeminiProvider{err: errors.New("gemini error")}
	adapter := newTestGeminiAdapter(provider)

	_, err := adapter.A2ATurn(context.Background(), nil, nil, nil, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "gemini error")
}

func TestGeminiA2AModelAdapterNoCandidates(t *testing.T) {
	provider := &fakeGeminiProvider{response: &GeminiGenerateResponse{Candidates: nil}}
	adapter := newTestGeminiAdapter(provider)

	_, err := adapter.A2ATurn(context.Background(), nil, nil, nil, nil)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no candidates")
}
