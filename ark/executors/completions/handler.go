package completions

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/openai/openai-go"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
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
	inputMessages  []Message
	memoryMessages []Message
	memory         MemoryInterface
	eventStream    EventStreamInterface
	querySpan      telemetry.Span
	targetSpan     telemetry.Span
}

func (s *executionState) finalizeStream(ctx context.Context, responseMessages []Message, tokenUsage arkv1alpha1.TokenUsage) {
	s.finalizeStreamWithPhase(ctx, responseMessages, tokenUsage, "done")
}

func (s *executionState) finalizeStreamForInteraction(ctx context.Context) {
	s.finalizeStreamWithPhase(ctx, nil, arkv1alpha1.TokenUsage{}, "interaction-required")
}

func (s *executionState) finalizeStreamWithPhase(ctx context.Context, responseMessages []Message, tokenUsage arkv1alpha1.TokenUsage, phase string) {
	if s.eventStream == nil {
		return
	}
	completedQuery := s.query.DeepCopy()
	completedQuery.Status.Phase = phase
	completedQuery.Status.TokenUsage = tokenUsage
	completedQuery.Status.ConversationId = s.conversationId
	if len(responseMessages) > 0 {
		rawJSON := serializeResponseMessages(responseMessages)
		completedQuery.Status.Response = &arkv1alpha1.Response{
			Target:  *s.target,
			Content: extractAssistantText(responseMessages),
			Raw:     rawJSON,
			Phase:   phase,
		}
	}
	finalChunk := NewContentChunk("chatcmpl-final", s.query.Name, "")
	wrappedChunk := WrapChunkWithMetadata(ctx, finalChunk, "", completedQuery)
	if err := s.eventStream.StreamChunk(ctx, wrappedChunk); err != nil {
		log.Error(err, "failed to send final chunk")
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
	if resumptionRef := extractResumptionMetadata(message); resumptionRef != nil {
		return h.processResumption(ctx, message, resumptionRef)
	}

	query, target, err := h.resolveQueryAndTarget(ctx, message)
	if err != nil {
		return nil, err
	}

	var a2aContextId string
	if message.ContextID != nil {
		a2aContextId = *message.ContextID
	}

	ctx, state, err := h.setupExecution(ctx, query, target, a2aContextId)
	if err != nil {
		return nil, err
	}
	defer state.querySpan.End()
	defer state.targetSpan.End()

	execResult, responseMessages, err := h.dispatchTarget(ctx, state)
	if err != nil {
		if interactionErr, ok := err.(*InteractionRequiredError); ok {
			return h.buildInteractionRequiredResponse(ctx, state, interactionErr), nil
		}
		// Save error messages to memory before returning
		// This ensures failed queries appear in conversation history with error context
		if state.memory != nil && len(state.inputMessages) > 0 {
			errorMessage := NewAssistantMessage(fmt.Sprintf("Error: %v", err))
			errorMessages := PrepareNewMessagesForMemory(state.inputMessages, []Message{errorMessage})
			if saveErr := state.memory.AddMessages(ctx, state.query.Name, errorMessages); saveErr != nil {
				log.Error(saveErr, "failed to save error messages to memory")
			}
		}

		state.finalizeStream(ctx, nil, arkv1alpha1.TokenUsage{})
		return nil, fmt.Errorf("execution failed: %w", err)
	}

	return h.buildA2AResponse(ctx, state, responseMessages, execResult), nil
}

type resumptionRef struct {
	ToolInteraction string
	Namespace       string
}

func extractResumptionMetadata(message protocol.Message) *resumptionRef {
	if message.Metadata == nil {
		return nil
	}
	resumptionData, ok := message.Metadata["ark.resumption"]
	if !ok {
		return nil
	}
	resumptionMap, ok := resumptionData.(map[string]any)
	if !ok {
		return nil
	}
	tiName, _ := resumptionMap["toolInteraction"].(string)
	namespace, _ := resumptionMap["namespace"].(string)
	if tiName == "" {
		return nil
	}
	return &resumptionRef{
		ToolInteraction: tiName,
		Namespace:       namespace,
	}
}

func (h *Handler) processResumption(ctx context.Context, message protocol.Message, ref *resumptionRef) (*taskmanager.MessageProcessingResult, error) {
	meta, err := extractArkMetadata(message)
	if err != nil {
		return nil, fmt.Errorf("failed to extract ark metadata for resumption: %w", err)
	}

	namespace := ref.Namespace
	if namespace == "" {
		namespace = meta.Query.Namespace
	}

	var ti arkv1alpha1.ToolInteraction
	if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: ref.ToolInteraction, Namespace: namespace}, &ti); err != nil {
		return nil, fmt.Errorf("failed to get ToolInteraction %s/%s: %w", namespace, ref.ToolInteraction, err)
	}

	execResult, err := h.ResumeFromInteraction(ctx, &ti)
	if err != nil {
		return nil, fmt.Errorf("resumption failed: %w", err)
	}

	responseContent := ""
	if execResult != nil && len(execResult.Messages) > 0 {
		responseContent = extractAssistantText(execResult.Messages)
	}

	responseMessage := protocol.NewMessage(
		protocol.MessageRoleAgent,
		[]protocol.Part{protocol.NewTextPart(responseContent)},
	)

	return &taskmanager.MessageProcessingResult{
		Result: &responseMessage,
	}, nil
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
	if target == nil && query.Spec.Selector != nil {
		resolved, err := h.resolveSelector(ctx, &query)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to resolve selector for query %s/%s: %w", meta.Query.Namespace, meta.Query.Name, err)
		}
		target = resolved
	}
	if target == nil {
		return nil, nil, fmt.Errorf("query %s/%s has no target", meta.Query.Namespace, meta.Query.Name)
	}

	return &query, target, nil
}

func (h *Handler) setupExecution(ctx context.Context, query *arkv1alpha1.Query, target *arkv1alpha1.QueryTarget, a2aContextId string) (context.Context, *executionState, error) {
	ctx = context.WithValue(ctx, QueryContextKey, query)
	ctx = h.eventing.QueryRecorder().InitializeQueryContext(ctx, query)
	ctx = h.eventing.QueryRecorder().StartTokenCollection(ctx)

	ctx, querySpan := h.telemetry.QueryRecorder().StartQuery(ctx, query, "execute")

	sessionId := query.Spec.SessionId
	if sessionId == "" {
		sessionId = string(query.UID)
	}
	ctx = WithQueryContext(ctx, string(query.UID), sessionId, query.Name)
	if a2aContextID, ok := query.Annotations[annotations.A2AContextID]; ok && a2aContextID != "" {
		ctx = WithA2AContextID(ctx, a2aContextID)
	}

	inputMessages, err := GetQueryInputMessages(ctx, *query, h.k8sClient)
	if err != nil {
		querySpan.End()
		return ctx, nil, fmt.Errorf("failed to get input messages: %w", err)
	}

	conversationId := a2aContextId
	if conversationId == "" {
		conversationId = query.Spec.ConversationId
	}
	memory, err := NewMemoryForQuery(ctx, h.k8sClient, query.Spec.Memory, query.Namespace, conversationId, query.Name, h.eventing.MemoryRecorder())
	if err != nil {
		querySpan.End()
		return ctx, nil, fmt.Errorf("failed to create memory client: %w", err)
	}

	if httpMemory, ok := memory.(*HTTPMemory); ok {
		conversationId = httpMemory.GetConversationID()
	}

	memoryMessages, err := memory.GetMessages(ctx)
	if err != nil {
		log.Error(err, "failed to load memory messages, continuing without history")
		memoryMessages = nil
	}

	eventStream, err := NewEventStreamForQuery(ctx, h.k8sClient, query.Namespace, sessionId, query.Name)
	if err != nil {
		log.Error(err, "failed to create event stream, continuing without streaming")
	}

	userContent := ExtractUserMessageContent(inputMessages)
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

func (h *Handler) dispatchTarget(ctx context.Context, state *executionState) (*ExecutionResult, []Message, error) {
	var execResult *ExecutionResult
	var responseMessages []Message
	var err error

	switch state.target.Type {
	case ToolTypeAgent, ToolTypeTeam:
		execResult, responseMessages, err = h.executeMember(ctx, state)
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
		StreamError(ctx, state.eventStream, err, "execution_failed", state.target.Name)
		return nil, nil, err
	}

	return execResult, responseMessages, nil
}

func (h *Handler) buildA2AResponse(ctx context.Context, state *executionState, responseMessages []Message, execResult *ExecutionResult) *taskmanager.MessageProcessingResult {
	responseContent := extractAssistantText(responseMessages)
	h.telemetry.QueryRecorder().RecordOutput(state.targetSpan, responseContent)
	h.telemetry.QueryRecorder().RecordRootOutput(state.querySpan, responseContent)
	h.telemetry.QueryRecorder().RecordSuccess(state.targetSpan)
	h.telemetry.QueryRecorder().RecordSuccess(state.querySpan)

	if state.memory != nil && len(responseMessages) > 0 {
		newMessages := PrepareNewMessagesForMemory(state.inputMessages, responseMessages)
		if saveErr := state.memory.AddMessages(ctx, state.query.Name, newMessages); saveErr != nil {
			log.Error(saveErr, "failed to save messages to memory")
		}
	}

	tokenSummary := h.eventing.QueryRecorder().GetTokenSummary(ctx)
	if tokenSummary.TotalTokens > 0 {
		h.telemetry.QueryRecorder().RecordTokenUsage(state.querySpan, tokenSummary.PromptTokens, tokenSummary.CompletionTokens, tokenSummary.TotalTokens)
	}

	responseMeta := buildResponseMeta(state, execResult, responseMessages, tokenSummary)

	responseMessage := protocol.NewMessage(
		protocol.MessageRoleAgent,
		[]protocol.Part{protocol.NewTextPart(responseContent)},
	)
	if len(responseMeta) > 0 {
		responseMessage.Metadata = map[string]any{
			arka2a.QueryExtensionMetadataKey: responseMeta,
		}
	}

	state.finalizeStream(ctx, responseMessages, tokenSummary)

	return &taskmanager.MessageProcessingResult{
		Result: &responseMessage,
	}
}

func (h *Handler) buildInteractionRequiredResponse(ctx context.Context, state *executionState, interactionErr *InteractionRequiredError) *taskmanager.MessageProcessingResult {
	log := logf.FromContext(ctx)
	log.Info("Interaction required for tool calls", "query", state.query.Name, "toolCalls", len(interactionErr.ToolCalls))

	toolCallInfos := make([]map[string]any, len(interactionErr.ToolCalls))
	for i, tc := range interactionErr.ToolCalls {
		toolCallInfos[i] = map[string]any{
			"id":        tc.ID,
			"name":      tc.Function.Name,
			"type":      string(tc.Type),
			"arguments": tc.Function.Arguments,
		}
	}

	interactionMeta := map[string]any{
		"interactionRequired": true,
		"toolCalls":           toolCallInfos,
	}
	if interactionErr.Interaction != nil {
		interactionMeta["interactionType"] = interactionErr.Interaction.Type
	}
	if interactionErr.Context != nil {
		interactionMeta["executionContext"] = map[string]any{
			"conversationHistory":  interactionErr.Context.ConversationHistory,
			"pendingToolCallIndex": interactionErr.Context.PendingToolCallIndex,
			"completedToolResults": interactionErr.Context.CompletedToolResults,
			"agentName":            interactionErr.Context.AgentName,
			"agentNamespace":       interactionErr.Context.AgentNamespace,
		}
	}

	responseMessage := protocol.NewMessage(
		protocol.MessageRoleAgent,
		[]protocol.Part{protocol.NewTextPart("Interaction required for tool execution")},
	)
	responseMessage.Metadata = map[string]any{
		arka2a.QueryExtensionMetadataKey: map[string]any{
			"query": map[string]string{
				"name":      state.query.Name,
				"namespace": state.query.Namespace,
			},
		},
		"ark.interaction": interactionMeta,
	}

	state.finalizeStreamForInteraction(ctx)

	return &taskmanager.MessageProcessingResult{
		Result: &responseMessage,
	}
}

func (h *Handler) executeMember(ctx context.Context, state *executionState) (*ExecutionResult, []Message, error) {
	var member TeamMember

	targetType := state.target.Type
	targetName := state.target.Name

	switch targetType {
	case ToolTypeAgent:
		var agentCRD arkv1alpha1.Agent
		if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: targetName, Namespace: state.query.Namespace}, &agentCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get agent %s: %w", targetName, err)
		}
		agent, err := MakeAgent(ctx, h.k8sClient, &agentCRD, h.telemetry, h.eventing)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to make agent %s: %w", targetName, err)
		}
		member = agent
	case ToolTypeTeam:
		var teamCRD arkv1alpha1.Team
		if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: targetName, Namespace: state.query.Namespace}, &teamCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get team %s: %w", targetName, err)
		}
		team, err := MakeTeam(ctx, h.k8sClient, &teamCRD, h.telemetry, h.eventing)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to make team %s: %w", targetName, err)
		}
		member = team
	default:
		return nil, nil, fmt.Errorf("unsupported member type: %s", targetType)
	}

	currentMessage, contextMessages := PrepareExecutionMessages(state.inputMessages, state.memoryMessages)
	result, err := member.Execute(ctx, currentMessage, contextMessages, state.memory, state.eventStream)
	if err != nil {
		return nil, nil, err
	}

	return result, result.Messages, nil
}

func (h *Handler) executeModel(
	ctx context.Context,
	query arkv1alpha1.Query,
	modelName string,
	inputMessages []Message,
	memoryMessages []Message,
	eventStream EventStreamInterface,
) ([]Message, error) {
	allMessages := PrepareModelMessages(inputMessages, memoryMessages)

	model, err := LoadModel(ctx, h.k8sClient, modelName, query.Namespace, nil, h.telemetry.ModelRecorder(), h.eventing.ModelRecorder())
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

	assistantMessage := Message(completion.Choices[0].Message.ToParam())
	return []Message{assistantMessage}, nil
}

func (h *Handler) executeTool(
	ctx context.Context,
	query arkv1alpha1.Query,
	toolName string,
	inputMessages []Message,
) ([]Message, error) {
	queryCrd := &query
	q, err := MakeQuery(queryCrd)
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
	toolCall := ToolCall{
		ID: "tool-call-" + toolName,
		Function: openai.ChatCompletionMessageToolCallFunction{
			Name:      toolName,
			Arguments: string(argsJSON),
		},
		Type: "function",
	}

	toolRegistry := NewToolRegistry(q.McpSettings, h.telemetry.ToolRecorder(), h.eventing.ToolRecorder())
	defer func() { _ = toolRegistry.Close() }()

	toolDefinition := CreateToolFromCRD(&toolCRD)
	mcpPool, mcpSettings := toolRegistry.GetMCPPool()
	executor, err := CreateToolExecutor(ctx, h.k8sClient, &toolCRD, query.Namespace, ToolExecutorDeps{
		MCPPool:           mcpPool,
		MCPSettings:       mcpSettings,
		TelemetryProvider: h.telemetry,
		EventingProvider:  h.eventing,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create tool executor: %w", err)
	}
	toolRegistry.RegisterTool(toolDefinition, executor)

	result, err := toolRegistry.ExecuteTool(ctx, toolCall)
	if err != nil {
		return nil, fmt.Errorf("tool execution failed: %w", err)
	}

	return []Message{NewAssistantMessage(result.Content)}, nil
}

func buildResponseMeta(state *executionState, execResult *ExecutionResult, responseMessages []Message, tokenSummary arkv1alpha1.TokenUsage) map[string]any {
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
	if execResult != nil && execResult.A2AResponse != nil {
		a2aMeta := map[string]string{}
		if execResult.A2AResponse.ContextID != "" {
			a2aMeta["contextId"] = execResult.A2AResponse.ContextID
		}
		if execResult.A2AResponse.TaskID != "" {
			a2aMeta["taskId"] = execResult.A2AResponse.TaskID
		}
		if len(a2aMeta) > 0 {
			responseMeta["a2a"] = a2aMeta
		}
	}
	responseMeta["messages"] = json.RawMessage(serializeResponseMessages(responseMessages))
	return responseMeta
}

func (h *Handler) resolveSelector(ctx context.Context, query *arkv1alpha1.Query) (*arkv1alpha1.QueryTarget, error) {
	labelSelector, err := metav1.LabelSelectorAsSelector(query.Spec.Selector)
	if err != nil {
		return nil, fmt.Errorf("invalid label selector: %w", err)
	}
	opts := &client.ListOptions{
		Namespace:     query.Namespace,
		LabelSelector: labelSelector,
	}

	checks := []struct {
		list    client.ObjectList
		typ     string
		getName func() string
	}{
		{&arkv1alpha1.AgentList{}, ToolTypeAgent, nil},
		{&arkv1alpha1.TeamList{}, ToolTypeTeam, nil},
		{&arkv1alpha1.ModelList{}, "model", nil},
		{&arkv1alpha1.ToolList{}, "tool", nil},
	}
	checks[0].getName = func() string { return firstItemName(checks[0].list.(*arkv1alpha1.AgentList).Items) }
	checks[1].getName = func() string { return firstItemName(checks[1].list.(*arkv1alpha1.TeamList).Items) }
	checks[2].getName = func() string { return firstItemName(checks[2].list.(*arkv1alpha1.ModelList).Items) }
	checks[3].getName = func() string { return firstItemName(checks[3].list.(*arkv1alpha1.ToolList).Items) }

	for _, c := range checks {
		if err := h.k8sClient.List(ctx, c.list, opts); err != nil {
			continue
		}
		if name := c.getName(); name != "" {
			return &arkv1alpha1.QueryTarget{Type: c.typ, Name: name}, nil
		}
	}

	return nil, fmt.Errorf("no matching resources found for selector")
}

func firstItemName[T any, PT interface {
	*T
	GetName() string
}](items []T) string {
	if len(items) > 0 {
		return PT(&items[0]).GetName()
	}
	return ""
}

// Query extension spec: ark/api/extensions/query/v1/
func extractArkMetadata(message protocol.Message) (*arkMetadata, error) {
	if message.Metadata == nil {
		return nil, fmt.Errorf("message has no metadata")
	}

	refData, ok := message.Metadata[arka2a.QueryExtensionMetadataKey]
	if !ok {
		return nil, fmt.Errorf("message metadata missing %s key", arka2a.QueryExtensionMetadataKey)
	}

	raw, err := json.Marshal(refData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal query ref: %w", err)
	}

	var ref queryRef
	if err := json.Unmarshal(raw, &ref); err != nil {
		return nil, fmt.Errorf("failed to parse query ref: %w", err)
	}

	meta := arkMetadata{Query: ref}

	return &meta, nil
}

func extractAssistantText(messages []Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		msg := messages[i]
		if msg.OfAssistant != nil && msg.OfAssistant.Content.OfString.Value != "" {
			return msg.OfAssistant.Content.OfString.Value
		}
	}
	return ""
}

func serializeResponseMessages(messages []Message) string {
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
		return "[]"
	}
	data, err := json.Marshal(actual)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func (h *Handler) ResumeFromInteraction(ctx context.Context, ti *arkv1alpha1.ToolInteraction) (*ExecutionResult, error) {
	execCtx := ti.Spec.ExecutionContext

	messages, err := DeserializeMessages(execCtx.ConversationHistory)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize conversation history: %w", err)
	}

	var query arkv1alpha1.Query
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      ti.Spec.QueryRef.Name,
		Namespace: ti.Spec.QueryRef.Namespace,
	}, &query); err != nil {
		return nil, fmt.Errorf("failed to get query: %w", err)
	}

	var agentCRD arkv1alpha1.Agent
	if err := h.k8sClient.Get(ctx, types.NamespacedName{
		Name:      execCtx.AgentName,
		Namespace: execCtx.AgentNamespace,
	}, &agentCRD); err != nil {
		return nil, fmt.Errorf("failed to get agent %s/%s: %w", execCtx.AgentNamespace, execCtx.AgentName, err)
	}

	ctx = context.WithValue(ctx, QueryContextKey, &query)
	agent, err := MakeAgent(ctx, h.k8sClient, &agentCRD, h.telemetry, h.eventing)
	if err != nil {
		return nil, fmt.Errorf("failed to make agent: %w", err)
	}

	approvedToolIDs := make(map[string]bool)
	if ti.Status.Response != nil && ti.Status.Response.Approval != nil && ti.Status.Response.Approval.Action == "approved" {
		for _, tc := range ti.Spec.ToolCalls {
			approvedToolIDs[tc.ID] = true
		}
	}

	sessionId := query.Spec.SessionId
	if sessionId == "" {
		sessionId = string(query.UID)
	}
	eventStream, err := NewEventStreamForQuery(ctx, h.k8sClient, query.Namespace, sessionId, query.Name)
	if err != nil {
		log.Error(err, "failed to create event stream for resumption")
	}

	return h.executeApprovedToolsAndContinue(ctx, agent, messages, approvedToolIDs, eventStream)
}

func (h *Handler) executeApprovedToolsAndContinue(
	ctx context.Context,
	agent *Agent,
	messages []Message,
	approvedToolIDs map[string]bool,
	eventStream EventStreamInterface,
) (*ExecutionResult, error) {
	var tools []openai.ChatCompletionToolParam
	if agent.Tools != nil {
		tools = agent.Tools.ToOpenAITools()
	}

	newMessages := []Message{}

	lastMsg := messages[len(messages)-1]
	if lastMsg.OfAssistant != nil && lastMsg.OfAssistant.ToolCalls != nil {
		for _, tc := range lastMsg.OfAssistant.ToolCalls {
			if !approvedToolIDs[tc.ID] {
				toolMessage := ToolMessage("Tool call was not approved", tc.ID)
				messages = append(messages, toolMessage)
				newMessages = append(newMessages, toolMessage)
				continue
			}

			result, err := agent.Tools.ExecuteTool(ctx, ToolCall{
				ID:   tc.ID,
				Type: "function",
				Function: openai.ChatCompletionMessageToolCallFunction{
					Name:      tc.Function.Name,
					Arguments: tc.Function.Arguments,
				},
			})
			toolMessage := ToolMessage(result.Content, result.ID)
			messages = append(messages, toolMessage)
			newMessages = append(newMessages, toolMessage)

			if err != nil {
				if IsTerminateTeam(err) {
					return &ExecutionResult{Messages: newMessages}, err
				}
				return nil, fmt.Errorf("approved tool execution failed: %w", err)
			}
		}
	}

	for {
		if ctx.Err() != nil {
			return &ExecutionResult{Messages: newMessages}, ctx.Err()
		}

		response, err := agent.executeModelCall(ctx, messages, tools, eventStream)
		if err != nil {
			return nil, err
		}

		choice := response.Choices[0]
		assistantMessage := agent.processAssistantMessage(choice)
		messages = append(messages, assistantMessage)
		newMessages = append(newMessages, assistantMessage)

		if len(choice.Message.ToolCalls) == 0 {
			return &ExecutionResult{Messages: newMessages}, nil
		}

		if err := agent.executeToolCalls(ctx, choice.Message.ToolCalls, &messages, &newMessages); err != nil {
			if IsInteractionRequired(err) {
				return &ExecutionResult{Messages: newMessages}, err
			}
			if IsTerminateTeam(err) {
				return &ExecutionResult{Messages: newMessages}, err
			}
			return nil, err
		}
	}
}
