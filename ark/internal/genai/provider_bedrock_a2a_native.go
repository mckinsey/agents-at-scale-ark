package genai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/bedrockruntime"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"
)

// A2ATurnNative executes a single native A2A turn without routing through
// ChatCompletions-shaped transport.
func (bm *BedrockModel) A2ATurnNative(
	ctx context.Context,
	messages []protocol.Message,
	toolOutcomes []A2AToolOutcome,
	tools []A2AToolDefinition,
	_ EventStreamInterface,
) (*A2ATurnResult, error) {
	if err := bm.initClient(ctx); err != nil {
		return nil, err
	}

	bedrockMessages, systemPrompt := convertA2AMessagesToBedrockNative(messages, toolOutcomes)
	request := bm.buildRequest(bedrockMessages, systemPrompt, convertA2AToolsToBedrockNative(tools))
	if strings.Contains(strings.ToLower(bm.Model), "claude") {
		request.AnthropicVersion = "bedrock-2023-05-31"
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}

	modelID := bm.Model
	if bm.ModelArn != "" {
		modelID = bm.ModelArn
	}
	input := &bedrockruntime.InvokeModelInput{
		ModelId:     aws.String(modelID),
		Body:        requestBody,
		ContentType: aws.String("application/json"),
		Accept:      aws.String("application/json"),
	}

	result, err := bm.client.InvokeModel(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to invoke Bedrock model: %w", err)
	}

	var response bedrockResponse
	if err := json.Unmarshal(result.Body, &response); err != nil {
		return nil, err
	}
	return convertBedrockResponseToA2ATurnResult(response), nil
}

func convertA2AToolsToBedrockNative(tools []A2AToolDefinition) []bedrockTool {
	if len(tools) == 0 {
		return nil
	}
	result := make([]bedrockTool, 0, len(tools))
	for _, tool := range tools {
		item := bedrockTool{
			Name:        tool.Name,
			Description: tool.Description,
		}
		if len(tool.Parameters) > 0 {
			item.InputSchema = tool.Parameters
		}
		result = append(result, item)
	}
	return result
}

func convertA2APartsToBedrockContent(message protocol.Message, outcomesByID map[string]string, usedOutcomes map[string]bool) ([]bedrockMessage, string) {
	role := resolveA2AMessageRole(message)
	content := extractTextFromParts(message.Parts)
	var result []bedrockMessage
	systemPrompt := ""

	switch role {
	case RoleSystem:
		if content != "" {
			systemPrompt = content
		}
	case RoleUser:
		if content != "" {
			result = append(result, bedrockMessage{Role: RoleUser, Content: content})
		}
	case RoleAssistant:
		if content != "" {
			result = append(result, bedrockMessage{Role: RoleAssistant, Content: content})
		}
		for _, call := range extractToolCallPayloadsFromParts(message.Parts) {
			if call.ID == "" {
				continue
			}
			outcomeContent, ok := outcomesByID[call.ID]
			if !ok {
				continue
			}
			usedOutcomes[call.ID] = true
			result = append(result, bedrockMessage{Role: RoleUser, Content: outcomeContent})
		}
	case RoleTool:
		if content != "" {
			result = append(result, bedrockMessage{Role: RoleUser, Content: content})
		}
	}
	return result, systemPrompt
}

func convertA2AMessagesToBedrockNative(messages []protocol.Message, toolOutcomes []A2AToolOutcome) ([]bedrockMessage, string) {
	outcomesByID := buildA2AToolOutcomeContentByID(toolOutcomes)
	usedOutcomes := map[string]bool{}
	result := make([]bedrockMessage, 0, len(messages)+len(toolOutcomes))
	systemPrompt := ""

	for _, message := range messages {
		msgs, sys := convertA2APartsToBedrockContent(message, outcomesByID, usedOutcomes)
		result = append(result, msgs...)
		if sys != "" {
			systemPrompt = sys
		}
	}

	for _, outcome := range toolOutcomes {
		if outcome.ToolCallID == "" || usedOutcomes[outcome.ToolCallID] {
			continue
		}
		outcomeContent, ok := outcomesByID[outcome.ToolCallID]
		if !ok {
			continue
		}
		result = append(result, bedrockMessage{Role: RoleUser, Content: outcomeContent})
	}
	return result, systemPrompt
}

func buildA2AToolOutcomeContentByID(outcomes []A2AToolOutcome) map[string]string {
	result := make(map[string]string, len(outcomes))
	for _, outcome := range outcomes {
		if outcome.ToolCallID == "" {
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
		result[outcome.ToolCallID] = content
	}
	return result
}

func extractToolCallPayloadsFromParts(parts []protocol.Part) []ToolCallPayloadV1 {
	for _, part := range parts {
		data, ok := decodePartData(part)
		if !ok {
			continue
		}
		schema, _ := data["schema"].(string)
		if schema != A2APayloadSchemaToolCallsV1 {
			continue
		}
		rawCalls, ok := data["toolCalls"]
		if !ok {
			return nil
		}
		raw, err := json.Marshal(rawCalls)
		if err != nil {
			return nil
		}
		var calls []ToolCallPayloadV1
		if err := json.Unmarshal(raw, &calls); err != nil {
			return nil
		}
		return calls
	}
	return nil
}

func convertBedrockResponseToA2ATurnResult(response bedrockResponse) *A2ATurnResult {
	content := ""
	toolCalls := make([]A2AToolCall, 0)
	payloadCalls := make([]ToolCallPayloadV1, 0)

	for _, item := range response.Content {
		switch item.Type {
		case "text":
			content = item.Text
		case BedrockContentTypeToolUse:
			arguments := mustMarshalJSON(item.Input)
			toolCalls = append(toolCalls, A2AToolCall{
				ID:        item.ID,
				Name:      item.Name,
				Arguments: arguments,
			})
			payloadCalls = append(payloadCalls, ToolCallPayloadV1{
				ID:        item.ID,
				Name:      item.Name,
				Arguments: arguments,
			})
		}
	}

	parts := []protocol.Part{protocol.NewTextPart(content)}
	if len(payloadCalls) > 0 {
		parts = appendPayloadPart(parts, ToolCallsPayloadV1{
			Schema:    A2APayloadSchemaToolCallsV1,
			ToolCalls: payloadCalls,
		})
	}

	result := &A2ATurnResult{
		Message:   protocol.NewMessage(protocol.MessageRoleAgent, parts),
		ToolCalls: toolCalls,
		Content:   content,
	}
	if response.Usage.InputTokens > 0 || response.Usage.OutputTokens > 0 {
		result.Usage = &A2ATurnUsage{
			PromptTokens:     int64(response.Usage.InputTokens),
			CompletionTokens: int64(response.Usage.OutputTokens),
			TotalTokens:      int64(response.Usage.InputTokens + response.Usage.OutputTokens),
		}
	}
	return result
}
