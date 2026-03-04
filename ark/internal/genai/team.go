package genai

import (
	"context"
	"fmt"
	"slices"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	logf "sigs.k8s.io/controller-runtime/pkg/log"
	"trpc.group/trpc-go/trpc-a2a-go/protocol"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/eventing"
	"mckinsey.com/ark/internal/telemetry"
)

// SelectorAgentInterface defines the interface for selector agents (used for testing)
type SelectorAgentInterface interface {
	Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
	ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
	FullName() string
}

type Team struct {
	Name              string
	Members           []TeamMember
	Strategy          string
	Description       string
	MaxTurns          *int
	Selector          *arkv1alpha1.TeamSelectorSpec
	Graph             *arkv1alpha1.TeamGraphSpec
	telemetryRecorder telemetry.TeamRecorder
	eventingRecorder  eventing.TeamRecorder
	telemetry         telemetry.Provider
	eventing          eventing.Provider
	Client            client.Client
	Namespace         string
	memory            MemoryInterface
	eventStream       EventStreamInterface
	// mockSelectorAgent is used for testing to inject a mock selector agent
	mockSelectorAgent SelectorAgentInterface
}

// FullName returns the namespace/name format for the team
func (t *Team) FullName() string {
	return t.Namespace + "/" + t.Name
}

// Deprecated: use ExecuteA2A for native A2A message input. This compat path will be removed after two minor releases.
func (t *Team) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	logf.FromContext(ctx).V(0).Info("using deprecated v0.3 compat execution path; migrate to ExecuteA2A", "team", t.FullName())
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members configured", t.FullName())
	}
	a2aUserInput, a2aHistory, err := convertCompatInputToA2A(userInput, history)
	if err != nil {
		return nil, err
	}
	return t.ExecuteA2A(ctx, a2aUserInput, a2aHistory, memory, eventStream)
}

func (t *Team) ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members configured", t.FullName())
	}

	if t.Strategy == StrategySelector && t.Selector != nil && t.Selector.Agent != "" {
		if err := t.validateSelectorA2ACompatibility(ctx); err != nil {
			return nil, err
		}
	}

	t.memory = memory
	t.eventStream = eventStream

	var execFunc func(context.Context, protocol.Message, []protocol.Message) ([]protocol.Message, error)
	switch t.Strategy {
	case StrategySequential:
		execFunc = t.executeSequentialA2A
	case StrategyRoundRobin:
		execFunc = t.executeRoundRobinA2A
	case StrategySelector:
		execFunc = t.executeSelectorA2A
	case StrategyGraph:
		execFunc = t.executeGraphA2A
	default:
		return nil, fmt.Errorf("unsupported strategy %s for team %s", t.Strategy, t.FullName())
	}

	messages, err := t.executeWithTrackingA2A(execFunc, ctx, userInput, history)
	return &ExecutionResult{
		A2AMessages: messages,
	}, err
}

//nolint:dupl // A2A variant intentionally mirrors executeSequential for separate removability
func (t *Team) executeSequentialA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	messages := slices.Clone(history)
	var newMessages []protocol.Message

	for i, member := range t.Members {
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, i, member.GetName(), member.GetType())

		operationData := map[string]string{
			"teamName": t.Name,
			"strategy": t.Strategy,
			"turn":     fmt.Sprintf("%d", i),
		}
		turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", i, t.Name), operationData)

		beforeCount := len(newMessages)
		err := t.executeMemberAndAccumulateA2A(turnCtx, member, userInput, &messages, &newMessages, i)

		turnMessages := newMessages[beforeCount:]
		if len(turnMessages) > 0 {
			t.telemetryRecorder.RecordTurnOutput(turnSpan, turnMessages, len(turnMessages))
		}

		if err != nil {
			t.telemetryRecorder.RecordError(turnSpan, err)
			turnSpan.End()
			t.eventingRecorder.Fail(turnCtx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, operationData)
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		t.telemetryRecorder.RecordSuccess(turnSpan)
		turnSpan.End()
		t.eventingRecorder.Complete(turnCtx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", i), operationData)
	}

	return newMessages, nil
}

func (t *Team) executeRoundRobinA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	messages := slices.Clone(history)
	var newMessages []protocol.Message

	messageCount := 0
	memberIndex := 0

	for {
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		if t.MaxTurns != nil && messageCount >= *t.MaxTurns {
			return newMessages, nil
		}

		member := t.Members[memberIndex]
		turnCtx, turnSpan := t.telemetryRecorder.StartTurn(ctx, messageCount, member.GetName(), member.GetType())

		operationData := map[string]string{
			"teamName": t.Name,
			"strategy": t.Strategy,
			"turn":     fmt.Sprintf("%d", messageCount),
		}
		turnCtx = t.eventingRecorder.Start(turnCtx, "TeamTurn", fmt.Sprintf("Executing turn %d for team %s", messageCount, t.Name), operationData)

		beforeCount := len(newMessages)
		err := t.executeMemberAndAccumulateA2A(turnCtx, member, userInput, &messages, &newMessages, messageCount)

		turnMessages := newMessages[beforeCount:]
		if len(turnMessages) > 0 {
			t.telemetryRecorder.RecordTurnOutput(turnSpan, turnMessages, len(turnMessages))
		}

		if err != nil {
			t.telemetryRecorder.RecordError(turnSpan, err)
			turnSpan.End()
			t.eventingRecorder.Fail(turnCtx, "TeamTurn", fmt.Sprintf("Team turn failed: %v", err), err, operationData)
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, fmt.Errorf("agent %s failed in team %s: %w", member.GetName(), t.FullName(), err)
		}

		t.telemetryRecorder.RecordSuccess(turnSpan)
		turnSpan.End()
		t.eventingRecorder.Complete(turnCtx, "TeamTurn", fmt.Sprintf("Team turn %d completed successfully", messageCount), operationData)

		messageCount++
		memberIndex = (memberIndex + 1) % len(t.Members)
	}
}

func (t *Team) GetName() string {
	return t.Name
}

func (t *Team) GetType() string {
	return string(teamKey)
}

func (t *Team) GetDescription() string {
	return t.Description
}

func MakeTeam(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (*Team, error) {
	members, err := loadTeamMembers(ctx, k8sClient, crd, telemetryProvider, eventingProvider)
	if err != nil {
		return nil, err
	}

	return &Team{
		Name:              crd.Name,
		Members:           members,
		Strategy:          crd.Spec.Strategy,
		Description:       crd.Spec.Description,
		MaxTurns:          crd.Spec.MaxTurns,
		Selector:          crd.Spec.Selector,
		Graph:             crd.Spec.Graph,
		telemetryRecorder: telemetryProvider.TeamRecorder(),
		eventingRecorder:  eventingProvider.TeamRecorder(),
		telemetry:         telemetryProvider,
		eventing:          eventingProvider,
		Client:            k8sClient,
		Namespace:         crd.Namespace,
	}, nil
}

func loadTeamMembers(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) ([]TeamMember, error) {
	members := make([]TeamMember, 0, len(crd.Spec.Members))

	for _, memberSpec := range crd.Spec.Members {
		member, _, err := loadTeamMember(ctx, k8sClient, memberSpec, crd.Namespace, crd.Name, telemetryProvider, eventingProvider)
		if err != nil {
			return nil, err
		}
		members = append(members, member)
	}

	return members, nil
}

//nolint:dupl // A2A variant intentionally mirrors executeWithTracking for separate removability
func (t *Team) executeWithTrackingA2A(execFunc func(context.Context, protocol.Message, []protocol.Message) ([]protocol.Message, error), ctx context.Context, userInput protocol.Message, history []protocol.Message) ([]protocol.Message, error) {
	maxTurns := 0
	if t.MaxTurns != nil {
		maxTurns = *t.MaxTurns
	}

	teamctx, span := t.telemetryRecorder.StartTeamExecution(ctx, t.Name, t.Namespace, t.Strategy, len(t.Members), maxTurns)
	defer span.End()

	teamctx = t.eventingRecorder.StartTokenCollection(teamctx)
	operationData := map[string]string{
		"teamName":    t.Name,
		"strategy":    t.Strategy,
		"memberCount": fmt.Sprintf("%d", len(t.Members)),
	}
	teamctx = t.eventingRecorder.Start(teamctx, "TeamExecution", fmt.Sprintf("Executing team %s", t.FullName()), operationData)

	result, err := execFunc(teamctx, userInput, history)
	if err != nil {
		t.telemetryRecorder.RecordError(span, err)
		t.eventingRecorder.Fail(teamctx, "TeamExecution", fmt.Sprintf("Team execution failed: %v", err), err, operationData)
		return result, err
	}

	t.telemetryRecorder.RecordSuccess(span)
	usage := t.eventingRecorder.GetTokenSummary(teamctx)
	operationData["promptTokens"] = fmt.Sprintf("%d", usage.PromptTokens)
	operationData["completionTokens"] = fmt.Sprintf("%d", usage.CompletionTokens)
	operationData["totalTokens"] = fmt.Sprintf("%d", usage.TotalTokens)
	t.eventingRecorder.Complete(teamctx, "TeamExecution", "Team execution completed successfully", operationData)

	t.telemetryRecorder.RecordTokenUsage(span, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
	// Intentionally uses parent ctx (not teamctx) to bubble the team's aggregated
	// token usage up to the enclosing scope (e.g., query-level token collection).
	t.eventingRecorder.AddTokenUsage(ctx, usage)
	return result, err
}

func (t *Team) executeMemberAndAccumulateA2A(ctx context.Context, member TeamMember, userInput protocol.Message, messages, newMessages *[]protocol.Message, turn int) error {
	ctx = WithExecutionMetadata(ctx, map[string]interface{}{
		"team":  t.Name,
		"agent": member.GetName(),
	})

	operationData := map[string]string{
		"memberType": member.GetType(),
		"memberName": member.GetName(),
		"strategy":   t.Strategy,
		"teamName":   t.Name,
		"turn":       fmt.Sprintf("%d", turn),
	}
	ctx = t.eventingRecorder.Start(ctx, "TeamMember", fmt.Sprintf("Executing member %s in team %s", member.GetName(), t.Name), operationData)

	result, err := executeTeamMemberA2A(ctx, member, userInput, *messages, t.memory, t.eventStream)
	if err != nil {
		if result != nil {
			memberMessages, extractErr := extractA2AMessages(result)
			if extractErr == nil {
				*messages = append(*messages, memberMessages...)
				*newMessages = append(*newMessages, memberMessages...)
			}
		}
		t.eventingRecorder.Fail(ctx, "TeamMember", fmt.Sprintf("Team member execution failed: %v", err), err, operationData)
		return err
	}

	memberMessages, err := extractA2AMessages(result)
	if err != nil {
		t.eventingRecorder.Fail(ctx, "TeamMember", fmt.Sprintf("Team member returned invalid A2A result: %v", err), err, operationData)
		return err
	}
	*messages = append(*messages, memberMessages...)
	*newMessages = append(*newMessages, memberMessages...)
	t.eventingRecorder.Complete(ctx, "TeamMember", "Team member execution completed successfully", operationData)
	return nil
}

type a2aTeamMember interface {
	ExecuteA2A(ctx context.Context, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error)
}

func executeTeamMemberA2A(ctx context.Context, member TeamMember, userInput protocol.Message, history []protocol.Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	executable, ok := member.(a2aTeamMember)
	if !ok {
		return nil, fmt.Errorf("team member %s does not support A2A execution", member.GetName())
	}
	return executable.ExecuteA2A(ctx, userInput, history, memory, eventStream)
}

func extractA2AMessages(result *ExecutionResult) ([]protocol.Message, error) {
	if result == nil {
		return nil, fmt.Errorf("execution result is nil")
	}
	if len(result.A2AMessages) > 0 {
		return result.A2AMessages, nil
	}
	if result.A2AResponse != nil {
		messages := buildA2AMessagesFromResponse(result.A2AResponse)
		if len(messages) > 0 {
			return messages, nil
		}
	}
	return nil, fmt.Errorf("execution result does not contain A2A messages")
}

func (t *Team) validateSelectorA2ACompatibility(ctx context.Context) error {
	if t.Selector == nil || t.Selector.Agent == "" {
		return nil
	}
	var agentCRD arkv1alpha1.Agent
	key := types.NamespacedName{Name: t.Selector.Agent, Namespace: t.Namespace}
	if err := t.Client.Get(ctx, key, &agentCRD); err != nil {
		return fmt.Errorf("failed to validate selector agent %s for A2A team %s: %w", t.Selector.Agent, t.FullName(), err)
	}
	return nil
}

func loadTeamMember(ctx context.Context, k8sClient client.Client, memberSpec arkv1alpha1.TeamMember, namespace, teamName string, telemetryProvider telemetry.Provider, eventingProvider eventing.Provider) (TeamMember, map[string]string, error) {
	key := types.NamespacedName{Name: memberSpec.Name, Namespace: namespace}

	switch memberSpec.Type {
	case string(agentKey):
		var agentCRD arkv1alpha1.Agent
		if err := k8sClient.Get(ctx, key, &agentCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get agent %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		var memberAnnotations map[string]string
		if shouldIncludeMemberAnnotationsForA2A(agentCRD.Annotations) {
			memberAnnotations = agentCRD.Annotations
		}
		member, err := MakeAgent(ctx, k8sClient, &agentCRD, telemetryProvider, eventingProvider)
		if err != nil {
			return nil, nil, err
		}
		return member, memberAnnotations, nil

	case "team":
		var nestedTeamCRD arkv1alpha1.Team
		if err := k8sClient.Get(ctx, key, &nestedTeamCRD); err != nil {
			return nil, nil, fmt.Errorf("failed to get team %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		member, err := MakeTeam(ctx, k8sClient, &nestedTeamCRD, telemetryProvider, eventingProvider)
		if err != nil {
			return nil, nil, err
		}
		return member, nil, nil

	default:
		return nil, nil, fmt.Errorf("unsupported member type %s for member %s in team %s", memberSpec.Type, memberSpec.Name, teamName)
	}
}

func shouldIncludeMemberAnnotationsForA2A(agentAnnotations map[string]string) bool {
	if agentAnnotations == nil {
		return false
	}
	return agentAnnotations[annotations.A2AServerAddress] != ""
}
