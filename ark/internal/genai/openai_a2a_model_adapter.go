package genai

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/packages/param"
	"k8s.io/apimachinery/pkg/runtime"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

type openAIA2AModelAdapter struct {
	provider          ChatCompletionProvider
	modelName         string
	modelType         string
	agentName         string
	agentNamespace    string
	outputSchema      *runtime.RawExtension
	schemaName        string
	telemetryRecorder telemetry.ModelRecorder
	eventingRecorder  eventing.ModelRecorder
	toolOutcomeByID   map[string]string
}

func NewOpenAIA2AModelAdapter(model *Model, agentName, agentNamespace string) A2AModelProvider {
	return &openAIA2AModelAdapter{
		provider:          model.Provider,
		modelName:         model.Model,
		modelType:         model.Type,
		agentName:         agentName,
		agentNamespace:    agentNamespace,
		outputSchema:      model.OutputSchema,
		schemaName:        model.SchemaName,
		telemetryRecorder: model.telemetryRecorder,
		eventingRecorder:  model.eventingRecorder,
		toolOutcomeByID:   map[string]string{},
	}
}

func (a *openAIA2AModelAdapter) A2ATurn(ctx context.Context, messages []protocol.Message, toolOutcomes []A2AToolOutcome, tools []A2AToolDefinition, eventStream EventStreamInterface) (*A2ATurnResult, error) {
	compatMessages, err := convertA2AMessagesToCompatExperimental(messages)
	if err != nil {
		return nil, fmt.Errorf("adapter: failed to convert A2A messages to compat: %w", err)
	}
	a.cacheToolOutcomes(toolOutcomes)
	compatMessages = a.ensureAssistantToolCallsArePaired(compatMessages)

	var openAITools []openai.ChatCompletionToolParam
	if len(tools) > 0 {
		openAITools = a2aToolDefsToOpenAI(tools)
	}

	if a.outputSchema != nil {
		a.provider.SetOutputSchema(a.outputSchema, a.schemaName)
	}

	modelCtx := WithA2AExperimentalEnabled(ctx, false)
	modelCtx = WithA2APayloadMode(modelCtx, A2APayloadModeCompat)
	forwardOpenAIChunks := eventStream != nil && !IsA2AExperimentalEnabledInContext(ctx)

	response, err := a.callProvider(modelCtx, compatMessages, openAITools, eventStream, forwardOpenAIChunks)
	if err != nil {
		return nil, err
	}

	if len(response.Choices) == 0 {
		return nil, fmt.Errorf("adapter: model returned empty response")
	}

	choice := response.Choices[0]
	return a.buildA2ATurnResult(choice)
}

func (a *openAIA2AModelAdapter) cacheToolOutcomes(outcomes []A2AToolOutcome) {
	if len(outcomes) == 0 {
		return
	}
	if a.toolOutcomeByID == nil {
		a.toolOutcomeByID = map[string]string{}
	}
	for _, message := range a2aToolOutcomesToOpenAI(outcomes) {
		if message.OfTool == nil {
			continue
		}
		id := message.OfTool.ToolCallID
		if id == "" {
			continue
		}
		a.toolOutcomeByID[id] = message.OfTool.Content.OfString.Value
	}
}

func (a *openAIA2AModelAdapter) ensureAssistantToolCallsArePaired(messages []Message) []Message {
	if len(messages) == 0 {
		return messages
	}
	out := make([]Message, 0, len(messages))
	for i := 0; i < len(messages); {
		current := messages[i]
		if current.OfAssistant == nil || len(current.OfAssistant.ToolCalls) == 0 {
			out = append(out, current)
			i++
			continue
		}

		out = append(out, current)
		j := i + 1
		explicitByID := make(map[string]Message)
		explicitOrder := make([]Message, 0)
		for j < len(messages) && messages[j].OfTool != nil {
			toolMsg := messages[j]
			explicitOrder = append(explicitOrder, toolMsg)
			explicitByID[toolMsg.OfTool.ToolCallID] = toolMsg
			j++
		}

		usedExplicit := make(map[string]bool)
		for _, toolCall := range current.OfAssistant.ToolCalls {
			toolCallID := toolCall.ID
			if toolCallID == "" {
				continue
			}
			if explicit, ok := explicitByID[toolCallID]; ok {
				out = append(out, explicit)
				usedExplicit[toolCallID] = true
				continue
			}
			if content, ok := a.toolOutcomeByID[toolCallID]; ok {
				out = append(out, openai.ToolMessage(content, toolCallID))
			}
		}

		// Preserve any explicit tool messages we couldn't map to assistant calls.
		for _, explicit := range explicitOrder {
			if !usedExplicit[explicit.OfTool.ToolCallID] {
				out = append(out, explicit)
			}
		}

		i = j
	}
	return out
}

func a2aToolOutcomesToOpenAI(outcomes []A2AToolOutcome) []Message {
	if len(outcomes) == 0 {
		return nil
	}
	messages := make([]Message, 0, len(outcomes))
	for _, outcome := range outcomes {
		toolCallID := outcome.ToolCallID
		if toolCallID == "" {
			continue
		}
		content := outcome.Content
		if content == "" {
			content = outcome.Error
		}
		if content == "" && len(outcome.Metadata) > 0 {
			raw, err := json.Marshal(outcome.Metadata)
			if err == nil {
				content = string(raw)
			}
		}
		if content == "" {
			content = "{}"
		}
		messages = append(messages, openai.ToolMessage(content, toolCallID))
	}
	if len(messages) == 0 {
		return nil
	}
	return messages
}

func (a *openAIA2AModelAdapter) callProvider(ctx context.Context, messages []Message, tools []openai.ChatCompletionToolParam, eventStream EventStreamInterface, forwardOpenAIChunks bool) (*openai.ChatCompletion, error) {
	ctx, span := a.telemetryRecorder.StartModelExecution(ctx, a.modelName, a.modelType)
	defer span.End()

	operationData := map[string]string{
		"model":     a.modelName,
		"modelType": a.modelType,
	}
	ctx = a.eventingRecorder.Start(ctx, "LLMCall", fmt.Sprintf("Calling model %s", a.modelName), operationData)

	otelMessages := make([]openai.ChatCompletionMessageParamUnion, 0, len(messages))
	otelMessages = append(otelMessages, messages...)
	a.telemetryRecorder.RecordInput(span, otelMessages)
	a.telemetryRecorder.RecordModelDetails(span, a.modelName, a.modelType)

	var response *openai.ChatCompletion
	var err error

	if eventStream != nil && forwardOpenAIChunks {
		response, err = a.provider.ChatCompletionStream(ctx, otelMessages, 1, func(chunk *openai.ChatCompletionChunk) error {
			chunkWithMeta := WrapChunkWithMetadata(ctx, chunk, a.modelName, nil)
			return eventStream.StreamChunk(ctx, chunkWithMeta)
		}, tools)
	} else {
		response, err = a.provider.ChatCompletion(ctx, otelMessages, 1, tools)
	}

	if err != nil {
		a.telemetryRecorder.RecordError(span, err)
		a.eventingRecorder.Fail(ctx, "LLMCall", fmt.Sprintf("Model call failed: %v", err), err, operationData)
		return nil, err
	}

	if response == nil {
		nilErr := fmt.Errorf("model provider returned nil response without error")
		a.telemetryRecorder.RecordError(span, nilErr)
		a.eventingRecorder.Fail(ctx, "LLMCall", "Model returned nil response", nilErr, operationData)
		return nil, nilErr
	}

	if len(response.Choices) > 0 {
		a.telemetryRecorder.RecordOutput(span, response.Choices[0].Message)
	}
	a.telemetryRecorder.RecordTokenUsage(span, response.Usage.PromptTokens, response.Usage.CompletionTokens, response.Usage.TotalTokens)
	a.telemetryRecorder.RecordSuccess(span)
	a.eventingRecorder.Complete(ctx, "LLMCall", "Model call completed successfully", operationData)
	a.eventingRecorder.AddTokenUsage(ctx, arkv1alpha1.TokenUsage{
		PromptTokens:     response.Usage.PromptTokens,
		CompletionTokens: response.Usage.CompletionTokens,
		TotalTokens:      response.Usage.TotalTokens,
	})

	return response, nil
}

func (a *openAIA2AModelAdapter) buildA2ATurnResult(choice openai.ChatCompletionChoice) (*A2ATurnResult, error) {
	content := choice.Message.Content

	assistantMsg := openai.AssistantMessage(content)
	if assistantMsg.OfAssistant != nil {
		assistantMsg.OfAssistant.Name = param.Opt[string]{Value: a.agentName}
	}

	if len(choice.Message.ToolCalls) > 0 {
		toolCallParams := make([]openai.ChatCompletionMessageToolCallParam, len(choice.Message.ToolCalls))
		for i, call := range choice.Message.ToolCalls {
			args := call.Function.Arguments
			if args == "" {
				args = "{}"
			}
			toolCallParams[i] = openai.ChatCompletionMessageToolCallParam{
				ID: call.ID,
				Function: openai.ChatCompletionMessageToolCallFunctionParam{
					Name:      call.Function.Name,
					Arguments: args,
				},
			}
		}
		assistantMsg.OfAssistant.ToolCalls = toolCallParams
	}

	a2aMsg, err := OpenAIToA2AMessageExperimental(assistantMsg)
	if err != nil {
		return nil, fmt.Errorf("adapter: failed to convert assistant message to A2A: %w", err)
	}

	var a2aToolCalls []A2AToolCall
	for _, tc := range choice.Message.ToolCalls {
		a2aToolCalls = append(a2aToolCalls, A2AToolCall{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: tc.Function.Arguments,
		})
	}

	return &A2ATurnResult{
		Message:   a2aMsg,
		ToolCalls: a2aToolCalls,
		Content:   content,
	}, nil
}

func a2aToolDefsToOpenAI(defs []A2AToolDefinition) []openai.ChatCompletionToolParam {
	params := make([]openai.ChatCompletionToolParam, len(defs))
	for i, def := range defs {
		params[i] = openai.ChatCompletionToolParam{
			Function: openai.FunctionDefinitionParam{
				Name:        def.Name,
				Description: openai.String(def.Description),
				Parameters:  openai.FunctionParameters(def.Parameters),
			},
		}
	}
	return params
}
