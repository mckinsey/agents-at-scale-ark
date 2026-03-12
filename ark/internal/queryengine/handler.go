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
	Target  *metadataTarget `json:"target,omitempty"`
}

type metadataTarget struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type queryRef struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

type executionState struct {
	query          arkv1alpha1.Query
	target         *arkv1alpha1.QueryTarget
	sessionId      string
	conversationId string
	inputMessages  []genai.Message
	memoryMessages []genai.Message
	memory         genai.MemoryInterface
	eventStream    genai.EventStreamInterface
	querySpan      telemetry.Span
	targetSpan     telemetry.Span
}

func (s *executionState) finalizeStream(ctx context.Context, responseMessages []genai.Message) {
	if s.eventStream == nil {
		return
	}
	if len(responseMessages) > 0 {
		rawJSON := serializeResponseMessages(responseMessages)
		completedQuery := s.query.DeepCopy()
		completedQuery.Status.Phase = "done"
		completedQuery.Status.Response = &arkv1alpha1.Response{
			Target:  *s.target,
			Content: extractAssistantText(responseMessages),
			Raw:     rawJSON,
			Phase:   "done",
		}
		finalChunk := genai.NewContentChunk("chatcmpl-final", s.query.Name, "")
		wrappedChunk := genai.WrapChunkWithMetadata(ctx, finalChunk, "", completedQuery)
		if err := s.eventStream.StreamChunk(ctx, wrappedChunk); err != nil {
			log.Error(err, "failed to send final chunk")
		}
	}
	if completionErr := s.eventStream.NotifyCompletion(ctx); completionErr != nil {
		log.Error(completionErr, "failed to notify stream completion")
	}
	if closeErr := s.eventStream.Close(); closeErr != nil {
		log.Error(closeErr, "failed to close event stream")
	}
}

func (h *Handler) ProcessMessage(
	ctx context.Context,
	message protocol.Message,
	options taskmanager.ProcessOptions,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	query, target, err := h.resolveQueryAndTarget(ctx, message)
	if err != nil {
		return nil, err
	}

	ctx, state, err := h.setupExecution(ctx, query, target)
	if err != nil {
		return nil, err
	}
	defer state.querySpan.End()
	defer state.targetSpan.End()

	responseMessages, err := h.dispatchTarget(ctx, state)
	if err != nil {
		state.finalizeStream(ctx, nil)
		return nil, fmt.Errorf("execution failed: %w", err)
	}

	return h.buildA2AResponse(ctx, state, responseMessages), nil
}

func (h *Handler) resolveQueryAndTarget(ctx context.Context, message protocol.Message) (*arkv1alpha1.Query, *arkv1alpha1.QueryTarget, error) {
	meta, err := extractArkMetadata(message)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to extract ark metadata: %w", err)
	}

	if meta.Query.Name == "" || meta.Query.Namespace == "" {
		return nil, nil, fmt.Errorf("query reference is required in ark metadata")
	}

	var query arkv1alpha1.Query
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      meta.Query.Name,
		Namespace: meta.Query.Namespace,
	}, &query); err != nil {
		return nil, nil, fmt.Errorf("failed to get query %s/%s: %w", meta.Query.Namespace, meta.Query.Name, err)
	}

	target := query.Spec.Target
	if target == nil && meta.Target != nil {
		target = &arkv1alpha1.QueryTarget{
			Type: meta.Target.Type,
			Name: meta.Target.Name,
		}
	}
	if target == nil {
		return nil, nil, fmt.Errorf("query %s/%s has no target", meta.Query.Namespace, meta.Query.Name)
	}

	return &query, target, nil
}

func (h *Handler) setupExecution(ctx context.Context, query *arkv1alpha1.Query, target *arkv1alpha1.QueryTarget) (context.Context, *executionState, error) {
	ctx = context.WithValue(ctx, genai.QueryContextKey, query)
	ctx = h.eventing.QueryRecorder().InitializeQueryContext(ctx, query)
	ctx = h.eventing.QueryRecorder().StartTokenCollection(ctx)

	ctx, querySpan := h.telemetry.QueryRecorder().StartQuery(ctx, query, "execute")

	sessionId := query.Spec.SessionId
	if sessionId == "" {
		sessionId = string(query.UID)
	}
	h.telemetry.QueryRecorder().RecordSessionID(querySpan, sessionId)

	inputMessages, err := genai.GetQueryInputMessages(ctx, *query, h.k8sClient)
	if err != nil {
		querySpan.End()
		return ctx, nil, fmt.Errorf("failed to get input messages: %w", err)
	}

	conversationId := query.Spec.ConversationId
	memory, err := genai.NewMemoryForQuery(ctx, h.k8sClient, query.Spec.Memory, query.Namespace, conversationId, query.Name, h.eventing.MemoryRecorder())
	if err != nil {
		querySpan.End()
		return ctx, nil, fmt.Errorf("failed to create memory client: %w", err)
	}

	if httpMemory, ok := memory.(*genai.HTTPMemory); ok {
		conversationId = httpMemory.GetConversationID()
	}

	memoryMessages, err := memory.GetMessages(ctx)
	if err != nil {
		log.Error(err, "failed to load memory messages, continuing without history")
		memoryMessages = nil
	}

	eventStream, err := genai.NewEventStreamForQuery(ctx, h.k8sClient, query.Namespace, sessionId, query.Name)
	if err != nil {
		log.Error(err, "failed to create event stream, continuing without streaming")
	}

	userContent := genai.ExtractUserMessageContent(inputMessages)
	h.telemetry.QueryRecorder().RecordRootInput(querySpan, userContent)

	ctx, targetSpan := h.telemetry.QueryRecorder().StartTarget(ctx, target.Type, target.Name)
	h.telemetry.QueryRecorder().RecordInput(targetSpan, userContent)

	state := &executionState{
		query:          *query,
		target:         target,
		sessionId:      sessionId,
		conversationId: conversationId,
		inputMessages:  inputMessages,
		memoryMessages: memoryMessages,
		memory:         memory,
		eventStream:    eventStream,
		querySpan:      querySpan,
		targetSpan:     targetSpan,
	}

	return ctx, state, nil
}

func (h *Handler) dispatchTarget(ctx context.Context, state *executionState) ([]genai.Message, error) {
	var responseMessages []genai.Message
	var err error

	switch state.target.Type {
	case "agent", "team":
		_, responseMessages, err = h.executeMember(ctx, state.query, state.target.Type, state.target.Name, state.inputMessages, state.memoryMessages, state.memory, state.eventStream)
	case "model":
		responseMessages, err = h.executeModel(ctx, state.query, state.target.Name, state.inputMessages, state.memoryMessages, state.eventStream)
	case "tool":
		responseMessages, err = h.executeTool(ctx, state.query, state.target.Name, state.inputMessages)
	default:
		err = fmt.Errorf("unsupported target type: %s", state.target.Type)
	}

	if err != nil {
		h.telemetry.QueryRecorder().RecordError(state.targetSpan, err)
		h.telemetry.QueryRecorder().RecordError(state.querySpan, err)
		genai.StreamError(ctx, state.eventStream, err, "execution_failed", state.target.Name)
		return nil, err
	}

	return responseMessages, nil
}

func (h *Handler) buildA2AResponse(ctx context.Context, state *executionState, responseMessages []genai.Message) *taskmanager.MessageProcessingResult {
	responseContent := extractAssistantText(responseMessages)
	h.telemetry.QueryRecorder().RecordOutput(state.targetSpan, responseContent)
	h.telemetry.QueryRecorder().RecordRootOutput(state.querySpan, responseContent)
	h.telemetry.QueryRecorder().RecordSuccess(state.targetSpan)
	h.telemetry.QueryRecorder().RecordSuccess(state.querySpan)

	if state.memory != nil && len(responseMessages) > 0 {
		newMessages := genai.PrepareNewMessagesForMemory(state.inputMessages, responseMessages)
		if saveErr := state.memory.AddMessages(ctx, state.query.Name, newMessages); saveErr != nil {
			log.Error(saveErr, "failed to save messages to memory")
		}
	}

	tokenSummary := h.eventing.QueryRecorder().GetTokenSummary(ctx)
	if tokenSummary.TotalTokens > 0 {
		h.telemetry.QueryRecorder().RecordTokenUsage(state.querySpan, tokenSummary.PromptTokens, tokenSummary.CompletionTokens, tokenSummary.TotalTokens)
	}

	responseMeta := map[string]any{}
	if tokenSummary.TotalTokens > 0 {
		responseMeta["tokenUsage"] = map[string]any{
			"prompt_tokens":     tokenSummary.PromptTokens,
			"completion_tokens": tokenSummary.CompletionTokens,
			"total_tokens":      tokenSummary.TotalTokens,
		}
	}
	if state.conversationId != "" {
		responseMeta["conversationId"] = state.conversationId
	}

	serializedMessages := serializeResponseMessages(responseMessages)
	if serializedMessages != "" {
		responseMeta["messages"] = json.RawMessage(serializedMessages)
	}

	responseMessage := protocol.NewMessage(
		protocol.MessageRoleAgent,
		[]protocol.Part{protocol.NewTextPart(responseContent)},
	)
	if len(responseMeta) > 0 {
		responseMessage.Metadata = map[string]any{
			genai.ArkMetadataKey: responseMeta,
		}
	}

	state.finalizeStream(ctx, responseMessages)

	return &taskmanager.MessageProcessingResult{
		Result: &responseMessage,
	}
}

func (h *Handler) executeMember(
	ctx context.Context,
	query arkv1alpha1.Query,
	targetType, targetName string,
	inputMessages []genai.Message,
	memoryMessages []genai.Message,
	memory genai.MemoryInterface,
	eventStream genai.EventStreamInterface,
) (*genai.ExecutionResult, []genai.Message, error) {
	var member genai.TeamMember

	switch targetType {
	case "agent":
		var agentCRD arkv1alpha1.Agent
		if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: targetName, Namespace: query.Namespace}, &agentCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get agent %s: %w", targetName, err)
		}
		agent, err := genai.MakeAgent(ctx, h.k8sClient, &agentCRD, h.telemetry, h.eventing)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to make agent %s: %w", targetName, err)
		}
		member = agent
	case "team":
		var teamCRD arkv1alpha1.Team
		if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: targetName, Namespace: query.Namespace}, &teamCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get team %s: %w", targetName, err)
		}
		team, err := genai.MakeTeam(ctx, h.k8sClient, &teamCRD, h.telemetry, h.eventing)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to make team %s: %w", targetName, err)
		}
		member = team
	default:
		return nil, nil, fmt.Errorf("unsupported member type: %s", targetType)
	}

	currentMessage, contextMessages := genai.PrepareExecutionMessages(inputMessages, memoryMessages)
	result, err := member.Execute(ctx, currentMessage, contextMessages, memory, eventStream)
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
	defer func() { _ = toolRegistry.Close() }()

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

func serializeResponseMessages(messages []genai.Message) string {
	var actual []interface{}
	for _, msg := range messages {
		switch {
		case msg.OfAssistant != nil:
			actual = append(actual, msg.OfAssistant)
		case msg.OfUser != nil:
			actual = append(actual, msg.OfUser)
		case msg.OfSystem != nil:
			actual = append(actual, msg.OfSystem)
		case msg.OfTool != nil:
			actual = append(actual, msg.OfTool)
		case msg.OfFunction != nil:
			actual = append(actual, msg.OfFunction)
		}
	}
	if len(actual) == 0 {
		return ""
	}
	data, err := json.Marshal(actual)
	if err != nil {
		return ""
	}
	return string(data)
}
