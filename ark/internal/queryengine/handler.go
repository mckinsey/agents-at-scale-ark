package queryengine

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/genai"
	"mckinsey.com/ark/internal/telemetry"
)

type Handler struct {
	k8sClient client.Client
	telemetry telemetry.Provider
	eventing  eventing.Provider
}

type arkMetadata struct {
	Agent   json.RawMessage `json:"agent"`
	Tools   json.RawMessage `json:"tools"`
	History json.RawMessage `json:"history"`
	Query   queryRef        `json:"query"`
}

type queryRef struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

func (h *Handler) ProcessMessage(
	ctx context.Context,
	message protocol.Message,
	options taskmanager.ProcessOptions,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	meta, err := extractArkMetadata(message)
	if err != nil {
		return nil, fmt.Errorf("failed to extract ark metadata: %w", err)
	}

	if meta.Query.Name == "" || meta.Query.Namespace == "" {
		return nil, fmt.Errorf("query reference is required in ark metadata")
	}

	var query arkv1alpha1.Query
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      meta.Query.Name,
		Namespace: meta.Query.Namespace,
	}, &query); err != nil {
		return nil, fmt.Errorf("failed to get query %s/%s: %w", meta.Query.Namespace, meta.Query.Name, err)
	}

	target := query.Spec.Target
	if target == nil {
		return nil, fmt.Errorf("query %s/%s has no target", meta.Query.Namespace, meta.Query.Name)
	}

	ctx = context.WithValue(ctx, genai.QueryContextKey, &query)

	inputMessages, err := genai.GetQueryInputMessages(ctx, query, h.k8sClient)
	if err != nil {
		return nil, fmt.Errorf("failed to get input messages: %w", err)
	}

	conversationId := query.Spec.ConversationId
	memory, err := genai.NewMemoryForQuery(ctx, h.k8sClient, query.Spec.Memory, query.Namespace, conversationId, query.Name, h.eventing.MemoryRecorder())
	if err != nil {
		return nil, fmt.Errorf("failed to create memory client: %w", err)
	}

	memoryMessages, err := memory.GetMessages(ctx)
	if err != nil {
		log.Error(err, "failed to load memory messages, continuing without history")
		memoryMessages = nil
	}

	eventStream, err := genai.NewEventStreamForQuery(ctx, h.k8sClient, query.Namespace, query.Spec.SessionId, query.Name)
	if err != nil {
		log.Error(err, "failed to create event stream, continuing without streaming")
	}

	var responseMessages []genai.Message

	switch target.Type {
	case "agent":
		_, responseMessages, err = h.executeAgent(ctx, query, target.Name, inputMessages, memoryMessages, memory, eventStream)
	case "team":
		_, responseMessages, err = h.executeTeam(ctx, query, target.Name, inputMessages, memoryMessages, memory, eventStream)
	case "model":
		responseMessages, err = h.executeModel(ctx, query, target.Name, inputMessages, memoryMessages, eventStream)
	case "tool":
		responseMessages, err = h.executeTool(ctx, query, target.Name, inputMessages)
	default:
		err = fmt.Errorf("unsupported target type: %s", target.Type)
	}

	if err != nil {
		return nil, fmt.Errorf("execution failed: %w", err)
	}

	if memory != nil && len(responseMessages) > 0 {
		newMessages := genai.PrepareNewMessagesForMemory(inputMessages, responseMessages)
		if saveErr := memory.AddMessages(ctx, query.Name, newMessages); saveErr != nil {
			log.Error(saveErr, "failed to save messages to memory")
		}
	}

	responseText := extractAssistantText(responseMessages)

	responseMessage := protocol.NewMessage(
		protocol.MessageRoleAgent,
		[]protocol.Part{protocol.NewTextPart(responseText)},
	)

	return &taskmanager.MessageProcessingResult{
		Result: &responseMessage,
	}, nil
}

func (h *Handler) executeAgent(
	ctx context.Context,
	query arkv1alpha1.Query,
	agentName string,
	inputMessages []genai.Message,
	memoryMessages []genai.Message,
	memory genai.MemoryInterface,
	eventStream genai.EventStreamInterface,
) (*genai.ExecutionResult, []genai.Message, error) {
	var agentCRD arkv1alpha1.Agent
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      agentName,
		Namespace: query.Namespace,
	}, &agentCRD); err != nil {
		return nil, nil, fmt.Errorf("failed to get agent %s: %w", agentName, err)
	}

	agent, err := genai.MakeAgent(ctx, h.k8sClient, &agentCRD, h.telemetry, h.eventing)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to make agent %s: %w", agentName, err)
	}

	currentMessage, contextMessages := genai.PrepareExecutionMessages(inputMessages, memoryMessages)
	result, err := agent.Execute(ctx, currentMessage, contextMessages, memory, eventStream)
	if err != nil {
		return nil, nil, err
	}

	return result, result.Messages, nil
}

func (h *Handler) executeTeam(
	ctx context.Context,
	query arkv1alpha1.Query,
	teamName string,
	inputMessages []genai.Message,
	memoryMessages []genai.Message,
	memory genai.MemoryInterface,
	eventStream genai.EventStreamInterface,
) (*genai.ExecutionResult, []genai.Message, error) {
	var teamCRD arkv1alpha1.Team
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      teamName,
		Namespace: query.Namespace,
	}, &teamCRD); err != nil {
		return nil, nil, fmt.Errorf("failed to get team %s: %w", teamName, err)
	}

	team, err := genai.MakeTeam(ctx, h.k8sClient, &teamCRD, h.telemetry, h.eventing)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to make team %s: %w", teamName, err)
	}

	currentMessage, contextMessages := genai.PrepareExecutionMessages(inputMessages, memoryMessages)
	result, err := team.Execute(ctx, currentMessage, contextMessages, memory, eventStream)
	if err != nil {
		return nil, nil, err
	}

	return result, result.Messages, nil
}

func (h *Handler) executeModel(
	ctx context.Context,
	query arkv1alpha1.Query,
	modelName string,
	inputMessages []genai.Message,
	memoryMessages []genai.Message,
	eventStream genai.EventStreamInterface,
) ([]genai.Message, error) {
	allMessages := genai.PrepareModelMessages(inputMessages, memoryMessages)

	model, err := genai.LoadModel(ctx, h.k8sClient, modelName, query.Namespace, nil, h.telemetry.ModelRecorder(), h.eventing.ModelRecorder())
	if err != nil {
		return nil, fmt.Errorf("failed to load model %s: %w", modelName, err)
	}

	completion, err := model.ChatCompletion(ctx, allMessages, eventStream, 1)
	if err != nil {
		return nil, err
	}

	if len(completion.Choices) == 0 {
		return nil, fmt.Errorf("model returned no completion choices")
	}

	assistantMessage := genai.Message(completion.Choices[0].Message.ToParam())
	return []genai.Message{assistantMessage}, nil
}

func (h *Handler) executeTool(
	ctx context.Context,
	query arkv1alpha1.Query,
	toolName string,
	inputMessages []genai.Message,
) ([]genai.Message, error) {
	queryCrd := &query
	q, err := genai.MakeQuery(queryCrd)
	if err != nil {
		return nil, fmt.Errorf("failed to make query: %w", err)
	}

	var toolCRD arkv1alpha1.Tool
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      toolName,
		Namespace: query.Namespace,
	}, &toolCRD); err != nil {
		return nil, fmt.Errorf("failed to get tool %s: %w", toolName, err)
	}

	lastMessage := inputMessages[len(inputMessages)-1]
	var resolvedInput string
	switch {
	case lastMessage.OfUser != nil:
		resolvedInput = lastMessage.OfUser.Content.OfString.Value
	case lastMessage.OfAssistant != nil:
		resolvedInput = lastMessage.OfAssistant.Content.OfString.Value
	case lastMessage.OfTool != nil:
		resolvedInput = lastMessage.OfTool.Content.OfString.Value
	default:
		return nil, fmt.Errorf("unable to extract content from input message")
	}

	var toolArgs map[string]any
	if err := json.Unmarshal([]byte(resolvedInput), &toolArgs); err != nil {
		toolArgs = map[string]any{"input": resolvedInput}
	}

	argsJSON, _ := json.Marshal(toolArgs)
	toolCall := genai.ToolCall{
		ID: "tool-call-" + toolName,
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      toolName,
			Arguments: string(argsJSON),
		},
		Type: "function",
	}

	toolRegistry := genai.NewToolRegistry(q.McpSettings, h.telemetry.ToolRecorder(), h.eventing.ToolRecorder())
	defer toolRegistry.Close()

	toolDefinition := genai.CreateToolFromCRD(&toolCRD)
	mcpPool, mcpSettings := toolRegistry.GetMCPPool()
	executor, err := genai.CreateToolExecutor(ctx, h.k8sClient, &toolCRD, query.Namespace, mcpPool, mcpSettings, h.telemetry, h.eventing)
	if err != nil {
		return nil, fmt.Errorf("failed to create tool executor: %w", err)
	}
	toolRegistry.RegisterTool(toolDefinition, executor)

	result, err := toolRegistry.ExecuteTool(ctx, toolCall)
	if err != nil {
		return nil, fmt.Errorf("tool execution failed: %w", err)
	}

	return []genai.Message{genai.NewAssistantMessage(result.Content)}, nil
}

func extractArkMetadata(message protocol.Message) (*arkMetadata, error) {
	if message.Metadata == nil {
		return nil, fmt.Errorf("message has no metadata")
	}

	arkData, ok := message.Metadata[genai.ArkMetadataKey]
	if !ok {
		return nil, fmt.Errorf("message metadata missing %s key", genai.ArkMetadataKey)
	}

	raw, err := json.Marshal(arkData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal ark metadata: %w", err)
	}

	var meta arkMetadata
	if err := json.Unmarshal(raw, &meta); err != nil {
		return nil, fmt.Errorf("failed to parse ark metadata: %w", err)
	}

	return &meta, nil
}

func extractAssistantText(messages []genai.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if msg.OfAssistant != nil && msg.OfAssistant.Content.OfString.Value != "" {
			return msg.OfAssistant.Content.OfString.Value
		}
	}
	return ""
}
