package completions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/openai/openai-go"
	"github.com/openai/openai-go/shared/constant"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"

	"trpc.group/trpc-go/trpc-a2a-go/protocol"
	"trpc.group/trpc-go/trpc-a2a-go/taskmanager"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	arka2a "mckinsey.com/ark/internal/a2a"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/common"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

type Handler struct {
	k8sClient client.Client
	telemetry telemetry.Provider
	eventing  eventing.Provider

	// withShutdown links a request context to the server lifetime, returning a context that is
	// cancelled when either the request ends or the server begins finalizing shutdown — so
	// long-running executions (streams) stop and run their finalize path instead of being
	// severed on process exit. Injected by NewServer (capturing the server context); when nil
	// (e.g. a bare Handler in tests) the request context is used unchanged.
	withShutdown func(context.Context) (context.Context, context.CancelFunc)
}

// mergeShutdown returns a child of reqCtx that is also cancelled when serverCtx is done,
// so an in-flight execution reacts to server shutdown as well as client disconnect. The
// returned cancel must be called to release resources.
func mergeShutdown(reqCtx, serverCtx context.Context) (context.Context, context.CancelFunc) {
	if serverCtx == nil {
		return context.WithCancel(reqCtx)
	}
	ctx, cancel := context.WithCancel(reqCtx)
	stop := context.AfterFunc(serverCtx, cancel)
	return ctx, func() { stop(); cancel() }
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
	isResumption   bool
	// memoryUnavailable is true when the query carried a conversationId but no
	// Memory backend was reachable, so history was silently dropped.
	memoryUnavailable bool
}

func (s *executionState) finalizeStream(ctx context.Context, responseMessages []Message, tokenUsage arkv1alpha1.TokenUsage) {
	if s.eventStream == nil {
		return
	}
	completedQuery := s.query.DeepCopy()
	completedQuery.Status.Phase = "done"
	completedQuery.Status.TokenUsage = tokenUsage
	completedQuery.Status.ConversationId = s.conversationId
	if len(responseMessages) > 0 {
		rawJSON := serializeResponseMessages(responseMessages)
		completedQuery.Status.Response = &arkv1alpha1.Response{
			Target:  *s.target,
			Content: extractAssistantText(responseMessages),
			Raw:     rawJSON,
			Phase:   "done",
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

//nolint:gocognit // TODO: Refactor to reduce cognitive complexity
func (h *Handler) ProcessMessage(
	ctx context.Context,
	message protocol.Message,
	options taskmanager.ProcessOptions,
	handler taskmanager.TaskHandler,
) (*taskmanager.MessageProcessingResult, error) {
	// Link the request to the server lifetime so a shutdown finalizes in-flight work. Fall
	// back to a plain cancellable context when no linker is injected (bare Handler in tests).
	merge := h.withShutdown
	if merge == nil {
		merge = func(reqCtx context.Context) (context.Context, context.CancelFunc) {
			return mergeShutdown(reqCtx, nil)
		}
	}
	ctx, cancel := merge(ctx)
	defer cancel()

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

	log := logf.FromContext(ctx)

	// Check if this is a resumption from HITL approval or rejection
	//nolint:nestif // TODO: Refactor to reduce nesting complexity
	if isResumption, a2aTask := h.checkResumption(ctx, query); isResumption {
		state.isResumption = true
		decision := "approved"
		if a2aTask.Status.Phase == arka2a.PhaseFailed {
			decision = "rejected"
		}
		log.Info("Detected resumption from HITL decision, handling completion",
			"queryName", query.Name,
			"taskId", a2aTask.Spec.TaskID,
			"decision", decision)
		execResult, responseMessages, err := h.handleResumption(ctx, state, a2aTask)
		if err != nil {
			// Check if this is another approval required error (cascading approval)
			var approvalErr *ApprovalRequiredError
			if errors.As(err, &approvalErr) {
				// Save any messages that were generated before the approval was required
				// For cascading approvals, only save responseMessages (no input) since the conversation
				// history already contains the original input from the first turn
				if state.memory != nil && len(responseMessages) > 0 {
					log.Info("Saving intermediate messages to memory before cascading approval", "messageCount", len(responseMessages), "queryName", state.query.Name)
					for i, msg := range responseMessages {
						msgUnion := openai.ChatCompletionMessageParamUnion(msg)
						role := RoleUnknown
						switch {
						case msgUnion.OfUser != nil:
							role = RoleUser
						case msgUnion.OfAssistant != nil:
							role = RoleAssistant
						case msgUnion.OfTool != nil:
							role = RoleTool
						}
						log.Info("Intermediate message to save", "index", i, "role", role)
					}
					if saveErr := state.memory.AddMessages(ctx, state.query.Name, responseMessages); saveErr != nil {
						log.Error(saveErr, "failed to save intermediate messages to memory")
					} else {
						log.Info("Successfully saved intermediate messages to memory")
					}
				}
				return h.handleApprovalRequired(ctx, state, approvalErr), nil
			}
			log.Error(err, "resumption failed")
			state.finalizeStream(ctx, nil, arkv1alpha1.TokenUsage{})
			return nil, fmt.Errorf("resumption failed: %w", err)
		}
		// Clear A2A metadata from result to prevent re-processing the same completed task
		// The old taskID should not persist in the Query status after successful resumption
		if execResult != nil {
			execResult.A2AResponse = nil
		}
		return h.buildA2AResponse(ctx, state, responseMessages, execResult), nil
	}

	execResult, responseMessages, err := h.dispatchTarget(ctx, state)
	if err != nil {
		// Check if this is an approval required error
		var approvalErr *ApprovalRequiredError
		if errors.As(err, &approvalErr) {
			h.saveInputMessagesToMemory(ctx, state)
			return h.handleApprovalRequired(ctx, state, approvalErr), nil
		}

		// Save error messages to memory before returning
		h.saveErrorMessagesToMemory(ctx, state, err)
		state.finalizeStream(ctx, nil, arkv1alpha1.TokenUsage{})
		return nil, fmt.Errorf("execution failed: %w", err)
	}

	return h.buildA2AResponse(ctx, state, responseMessages, execResult), nil
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
	memory, err := NewMemoryForQuery(ctx, h.k8sClient, query.Spec.Memory, query.Namespace, conversationId, query.Name, common.TtlSecondsFromQuery(query), h.eventing.MemoryRecorder())
	if err != nil {
		querySpan.End()
		return ctx, nil, fmt.Errorf("failed to create memory client: %w", err)
	}

	if httpMemory, ok := memory.(*HTTPMemory); ok {
		conversationId = httpMemory.GetConversationID()
	}

	_, isNoop := memory.(*NoopMemory)
	memoryUnavailable := isNoop && conversationId != ""

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

		memoryUnavailable: memoryUnavailable,
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
		// Don't stream error for approval required - it will be handled separately
		var approvalErr *ApprovalRequiredError
		if !errors.As(err, &approvalErr) {
			h.telemetry.QueryRecorder().RecordError(state.targetSpan, err)
			h.telemetry.QueryRecorder().RecordError(state.querySpan, err)
			StreamError(ctx, state.eventStream, err, "execution_failed", state.target.Name)
		}
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

	h.saveFinalMessagesToMemory(ctx, state, responseMessages)

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
		defer agent.Close()
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
		defer team.Close()
		member = team
	default:
		return nil, nil, fmt.Errorf("unsupported member type: %s", targetType)
	}

	currentMessage, contextMessages := PrepareExecutionMessages(state.inputMessages, state.memoryMessages)
	result, err := member.Execute(ctx, currentMessage, contextMessages, state.memory, state.eventStream, ExecuteOptions{})
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

	completion, err := model.ChatCompletion(ctx, allMessages, eventStream, 1, nil, ToolChoiceUnset)
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
			"cached_tokens":     tokenSummary.CachedTokens,
		}
	}
	if state.conversationId != "" {
		responseMeta["conversationId"] = state.conversationId
	}
	if state.memoryUnavailable {
		responseMeta["memoryUnavailable"] = true
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

// handleApprovalRequired handles the approval required error by creating an A2A task
func (h *Handler) handleApprovalRequired(
	ctx context.Context,
	state *executionState,
	approvalErr *ApprovalRequiredError,
) *taskmanager.MessageProcessingResult {
	// Generate task ID
	taskID := protocol.GenerateRPCID()

	// Serialize tool calls for metadata
	toolCallsJSON, err := json.Marshal(approvalErr.ToolCalls)
	if err != nil {
		log.Error(err, "failed to serialize tool calls")
		toolCallsJSON = []byte("[]")
	}

	// Serialize context for metadata
	contextJSON, err := json.Marshal(approvalErr.Context)
	if err != nil {
		log.Error(err, "failed to serialize context")
		contextJSON = []byte("{}")
	}

	// Build task metadata with approval details (all values as strings or primitive types)
	metadata := map[string]interface{}{
		"toolCalls": string(toolCallsJSON),
		"timeout":   approvalErr.Config.Timeout.Duration.String(),
		"onTimeout": approvalErr.Config.OnTimeout,
		"context":   string(contextJSON),
	}

	// Create task with input-required state
	task := &protocol.Task{
		ID:        taskID,
		ContextID: state.conversationId,
		Kind:      "task",
		Status: protocol.TaskStatus{
			State: protocol.TaskStateInputRequired,
		},
		Metadata: metadata,
	}

	// Emit streaming event for approval request
	if state.eventStream != nil {
		StreamApprovalRequest(ctx, state.eventStream, taskID, approvalErr.ToolCalls,
			approvalErr.Config, approvalErr.Context.AgentName)

		// Close stream without setting phase to "done" (query will transition to input-required)
		if completionErr := state.eventStream.NotifyCompletion(ctx); completionErr != nil {
			log.Error(completionErr, "failed to notify stream completion for approval")
		}
		if closeErr := state.eventStream.Close(); closeErr != nil {
			log.Error(closeErr, "failed to close event stream for approval")
		}
	}

	h.telemetry.QueryRecorder().RecordSuccess(state.targetSpan)
	h.telemetry.QueryRecorder().RecordSuccess(state.querySpan)

	return &taskmanager.MessageProcessingResult{
		Result: task,
	}
}

// checkResumption checks if this query execution is a resumption from HITL approval or rejection
func (h *Handler) checkResumption(ctx context.Context, query *arkv1alpha1.Query) (bool, *arkv1alpha1.A2ATask) {
	log := logf.FromContext(ctx)

	log.Info("checkResumption called", "queryName", query.Name, "queryPhase", query.Status.Phase)

	// Check if query has A2A metadata with taskID
	if query.Status.Response == nil || query.Status.Response.A2A == nil || query.Status.Response.A2A.TaskID == "" {
		log.Info("No A2A taskID found, not a resumption", "hasResponse", query.Status.Response != nil)
		return false, nil
	}

	taskID := query.Status.Response.A2A.TaskID
	taskName := fmt.Sprintf("a2a-task-%s", taskID)
	log.Info("Found A2A taskID, checking task status", "taskId", taskID, "taskName", taskName)

	var a2aTask arkv1alpha1.A2ATask
	if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: taskName, Namespace: query.Namespace}, &a2aTask); err != nil {
		if client.IgnoreNotFound(err) != nil {
			log.Error(err, "failed to get A2ATask for resumption check")
		}
		log.Info("A2ATask not found or error fetching", "error", err)
		return false, nil
	}

	log.Info("A2ATask status", "taskId", taskID, "phase", a2aTask.Status.Phase)

	// Check if task is completed (approval) or denied in a way the agent can react to
	if a2aTask.Status.Phase == arka2a.PhaseCompleted {
		log.Info("A2ATask completed, resuming", "taskId", taskID)
		return true, &a2aTask
	}

	if arka2a.IsResumableDenial(&a2aTask) {
		log.Info("Detected resumable denial, will resume to let agent handle gracefully", "taskId", taskID)
		return true, &a2aTask
	}

	log.Info("A2ATask not completed/denied, not resuming", "taskId", taskID, "phase", a2aTask.Status.Phase)
	return false, nil
}

// handleResumption handles query resumption after HITL approval or rejection
//
//nolint:gocognit // TODO: Refactor to reduce cognitive complexity
func (h *Handler) handleResumption(ctx context.Context, state *executionState, a2aTask *arkv1alpha1.A2ATask) (*ExecutionResult, []Message, error) {
	log := logf.FromContext(ctx)

	// Get conversation ID from A2ATask
	conversationID := a2aTask.Spec.ContextID
	if conversationID == "" {
		return nil, nil, fmt.Errorf("A2ATask has no contextId for memory retrieval")
	}

	log.Info("Fetching conversation history from memory service", "conversationId", conversationID)

	// Parse tool calls from A2ATask metadata
	toolCallsJSON, ok := a2aTask.Status.ProtocolMetadata["toolCalls"]
	if !ok {
		return nil, nil, fmt.Errorf("A2ATask has no toolCalls in protocolMetadata")
	}

	var toolCallsData []struct {
		ID       string `json:"id"`
		Function struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
		} `json:"function"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(toolCallsJSON), &toolCallsData); err != nil {
		return nil, nil, fmt.Errorf("failed to parse toolCalls from A2ATask: %w", err)
	}

	// Check if this is approval or rejection
	isApproved := a2aTask.Status.Phase == arka2a.PhaseCompleted
	isRejected := a2aTask.Status.Phase == arka2a.PhaseFailed
	rejectionError := "Tool execution rejected by user"
	if isRejected && arka2a.IsTimeoutRejection(a2aTask) {
		rejectionError = "Tool execution rejected: approval timeout exceeded"
	}

	if isApproved {
		log.Info("Executing approved tool calls", "count", len(toolCallsData))
	} else if isRejected {
		log.Info("Handling rejected tool calls - will return error results", "count", len(toolCallsData), "reason", rejectionError)
	}

	// Resolve the agent that requested approval. For team targets the query
	// target names the team, not the agent, so prefer the agent captured in the
	// approval context; fall back to the target for direct agent queries.
	agentName, agentNamespace := resolveResumptionAgent(state, a2aTask)
	var agentCRD arkv1alpha1.Agent
	if err := h.k8sClient.Get(ctx, types.NamespacedName{Name: agentName, Namespace: agentNamespace}, &agentCRD); err != nil {
		return nil, nil, fmt.Errorf("failed to get agent %s: %w", agentName, err)
	}

	// Create agent instance - needed for resuming execution with results (approval or rejection)
	agent, err := MakeAgent(ctx, h.k8sClient, &agentCRD, h.telemetry, h.eventing)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to make agent %s: %w", agentName, err)
	}

	// Convert parsed tool calls to openai format
	toolCalls := make([]openai.ChatCompletionMessageToolCall, len(toolCallsData))
	approvedResults := []ToolResult{}

	for i, tcData := range toolCallsData {
		tc := openai.ChatCompletionMessageToolCall{
			ID:   tcData.ID,
			Type: constant.Function(tcData.Type),
			Function: openai.ChatCompletionMessageToolCallFunction{
				Name:      tcData.Function.Name,
				Arguments: tcData.Function.Arguments,
			},
		}
		toolCalls[i] = tc

		//nolint:nestif // TODO: Refactor to reduce nesting complexity
		if isApproved {
			// APPROVED: Execute the tool
			result, err := agent.executeToolCall(ctx, tc)
			if err != nil {
				log.Error(err, "failed to execute approved tool call", "toolName", tc.Function.Name)
				// Create error result
				approvedResults = append(approvedResults, ToolResult{
					ID:      tc.ID,
					Content: fmt.Sprintf("Error executing tool: %v", err),
				})
			} else {
				// Extract message content - result is a Message type (tool message)
				// Convert to string content for tool result
				if toolMsg := result.OfTool; toolMsg != nil {
					if content := toolMsg.Content.OfString; content.Value != "" {
						approvedResults = append(approvedResults, ToolResult{
							ID:      tc.ID,
							Content: content.Value,
						})
					} else {
						approvedResults = append(approvedResults, ToolResult{
							ID:      tc.ID,
							Content: fmt.Sprintf("%v", toolMsg.Content),
						})
					}
				} else {
					approvedResults = append(approvedResults, ToolResult{
						ID:      tc.ID,
						Content: fmt.Sprintf("%v", result),
					})
				}
			}
		} else if isRejected {
			// REJECTED: Return error result without executing
			approvedResults = append(approvedResults, ToolResult{
				ID:      tc.ID,
				Name:    tc.Function.Name,
				Error:   rejectionError,
				Content: "",
			})
		}
	}

	// Resume agent execution with tool results (may include approval successes or rejection errors)
	log.Info("Resuming agent execution with tool results", "results", len(approvedResults), "decision", map[bool]string{true: "approved", false: "rejected"}[isApproved])
	result, err := agent.ResumeFromApproval(ctx, toolCalls, approvedResults, state.memory, state.eventStream, state.inputMessages)
	if err != nil {
		// Check if this is another approval required error (cascading approval)
		var approvalErr *ApprovalRequiredError
		if errors.As(err, &approvalErr) {
			log.Info("Detected cascading approval required, returning partial result with messages")
			// Return the partial result and messages before the approval error
			// The caller will stream these messages first, then handle the approval
			return result, result.Messages, err
		}
		log.Info("Error is not ApprovalRequiredError, wrapping", "errorType", fmt.Sprintf("%T", err))
		return nil, nil, fmt.Errorf("failed to resume agent execution: %w", err)
	}

	return result, result.Messages, nil
}

// resolveResumptionAgent determines which agent to resume after approval. The
// approval context records the agent that actually requested approval (a team
// member when the query targets a team); fall back to the query target for
// direct agent queries or when no context was persisted.
func resolveResumptionAgent(state *executionState, a2aTask *arkv1alpha1.A2ATask) (string, string) {
	name := state.target.Name
	namespace := state.query.Namespace

	ctxJSON, ok := a2aTask.Status.ProtocolMetadata["context"]
	if !ok {
		return name, namespace
	}

	var execCtx ExecutionContext
	if err := json.Unmarshal([]byte(ctxJSON), &execCtx); err != nil {
		return name, namespace
	}

	if execCtx.AgentName != "" {
		name = execCtx.AgentName
	}
	if execCtx.AgentNamespace != "" {
		namespace = execCtx.AgentNamespace
	}
	return name, namespace
}

// saveInputMessagesToMemory saves input messages to memory before first approval
func (h *Handler) saveInputMessagesToMemory(ctx context.Context, state *executionState) {
	if state.memory == nil || len(state.inputMessages) == 0 {
		return
	}

	log := logf.FromContext(ctx)
	log.Info("Saving input messages to memory before first approval", "messageCount", len(state.inputMessages), "queryName", state.query.Name)

	if err := state.memory.AddMessages(ctx, state.query.Name, state.inputMessages); err != nil {
		log.Error(err, "failed to save input messages to memory before approval")
	} else {
		log.Info("Successfully saved input messages to memory before first approval")
	}
}

// saveErrorMessagesToMemory saves error messages to memory
func (h *Handler) saveErrorMessagesToMemory(ctx context.Context, state *executionState, err error) {
	if state.memory == nil || len(state.inputMessages) == 0 {
		return
	}

	log := logf.FromContext(ctx)
	errorMessage := NewAssistantMessage(fmt.Sprintf("Error: %v", err))
	errorMessages := PrepareNewMessagesForMemory(state.inputMessages, []Message{errorMessage})

	if saveErr := state.memory.AddMessages(ctx, state.query.Name, errorMessages); saveErr != nil {
		log.Error(saveErr, "failed to save error messages to memory")
	}
}

// saveFinalMessagesToMemory saves final messages to memory after successful execution
func (h *Handler) saveFinalMessagesToMemory(ctx context.Context, state *executionState, responseMessages []Message) {
	if state.memory == nil || len(responseMessages) == 0 {
		return
	}

	log := logf.FromContext(ctx)
	var messagesToSave []Message

	if state.isResumption {
		messagesToSave = responseMessages
		log.Info("Saving final messages (resumption)", "messageCount", len(messagesToSave), "queryName", state.query.Name)
	} else {
		messagesToSave = PrepareNewMessagesForMemory(state.inputMessages, responseMessages)
		log.Info("Saving final messages (first execution)", "messageCount", len(messagesToSave), "inputCount", len(state.inputMessages), "responseCount", len(responseMessages), "queryName", state.query.Name)
	}

	for i, msg := range messagesToSave {
		msgUnion := openai.ChatCompletionMessageParamUnion(msg)
		role := RoleUnknown
		switch {
		case msgUnion.OfUser != nil:
			role = RoleUser
		case msgUnion.OfAssistant != nil:
			role = RoleAssistant
		case msgUnion.OfTool != nil:
			role = RoleTool
		}
		log.Info("Final message to save", "index", i, "role", role)
	}

	if err := state.memory.AddMessages(ctx, state.query.Name, messagesToSave); err != nil {
		log.Error(err, "failed to save messages to memory")
	} else {
		log.Info("Successfully saved final messages to memory")
	}
}
