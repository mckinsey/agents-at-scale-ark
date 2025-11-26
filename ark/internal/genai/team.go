package genai

import (
	"context"
	"fmt"
	"slices"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/telemetry"
)

type Team struct {
	Name              string
	Members           []TeamMember
	Strategy          string
	Description       string
	MaxTurns          *int
	Selector          *arkv1alpha1.TeamSelectorSpec
	Graph             *arkv1alpha1.TeamGraphSpec
	Recorder          EventEmitter
	TeamRecorder      telemetry.TeamRecorder
	TelemetryProvider telemetry.Provider
	Client            client.Client
	Namespace         string
	memory            MemoryInterface
	eventStream       EventStreamInterface
}

// FullName returns the namespace/name format for the team
func (t *Team) FullName() string {
	return t.Namespace + "/" + t.Name
}

func (t *Team) Execute(ctx context.Context, userInput Message, history []Message, memory MemoryInterface, eventStream EventStreamInterface) (*ExecutionResult, error) {
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members configured", t.FullName())
	}

	// Store memory and streaming parameters for member execution
	t.memory = memory
	t.eventStream = eventStream

	teamTracker := NewOperationTracker(t.Recorder, ctx, "TeamExecution", t.FullName(), map[string]string{
		"strategy":    t.Strategy,
		"queryId":     getQueryID(ctx),
		"sessionId":   getSessionID(ctx),
		"teamName":    t.FullName(),
		"memberCount": fmt.Sprintf("%d", len(t.Members)),
	})

	var execFunc func(context.Context, Message, []Message) ([]Message, error)
	switch t.Strategy {
	case "sequential":
		execFunc = t.executeSequential
	case "round-robin":
		execFunc = t.executeRoundRobin
	case "selector":
		execFunc = t.executeSelector
	case "graph":
		execFunc = t.executeGraph
	default:
		err := fmt.Errorf("unsupported strategy %s for team %s", t.Strategy, t.FullName())
		teamTracker.Fail(err)
		return nil, err
	}

	messages, err := t.executeWithTracking(teamTracker, execFunc, ctx, userInput, history)
	return &ExecutionResult{Messages: messages}, err
}

func (t *Team) executeSequential(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := slices.Clone(history)
	var newMessages []Message

	for i, member := range t.Members {
		// Check if context was cancelled
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		// Start turn-level telemetry span
		turnCtx, turnSpan := t.TeamRecorder.StartTurn(ctx, i, member.GetName(), member.GetType())

		err := t.executeMemberAndAccumulate(turnCtx, member, userInput, &messages, &newMessages, i)

		// Record turn output
		if len(newMessages) > 0 {
			t.TeamRecorder.RecordTurnOutput(turnSpan, newMessages, len(newMessages))
		}

		if err != nil {
			t.TeamRecorder.RecordError(turnSpan, err)
			turnSpan.End()
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}

		t.TeamRecorder.RecordSuccess(turnSpan)
		turnSpan.End()
	}

	return newMessages, nil
}

func (t *Team) executeRoundRobin(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := slices.Clone(history)
	var newMessages []Message

	messageCount := 0 // Count individual agent messages
	memberIndex := 0  // Track which agent should speak next

	for {
		// Check if context was cancelled
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		// Check maxTurns before executing
		if t.MaxTurns != nil && messageCount >= *t.MaxTurns {
			turnTracker := NewExecutionRecorder(t.Recorder)
			turnTracker.TeamTurn(ctx, "MaxTurns", t.FullName(), t.Strategy, messageCount)

			// Log maxTurns reached and return success with accumulated messages
			t.Recorder.EmitEvent(ctx, corev1.EventTypeWarning, "TeamMaxTurnsReached", BaseEvent{
				Name: t.FullName(),
				Metadata: map[string]string{
					"strategy":     t.Strategy,
					"maxTurns":     fmt.Sprintf("%d", *t.MaxTurns),
					"teamName":     t.FullName(),
					"messageCount": fmt.Sprintf("%d", messageCount),
				},
			})
			return newMessages, nil
		}

		// Execute current agent
		member := t.Members[memberIndex]

		// Start turn-level telemetry span
		turnCtx, turnSpan := t.TeamRecorder.StartTurn(ctx, messageCount, member.GetName(), member.GetType())

		err := t.executeMemberAndAccumulate(turnCtx, member, userInput, &messages, &newMessages, messageCount)

		// Record turn output
		if len(newMessages) > 0 {
			t.TeamRecorder.RecordTurnOutput(turnSpan, newMessages, len(newMessages))
		}

		if err != nil {
			t.TeamRecorder.RecordError(turnSpan, err)
			turnSpan.End()
			if IsTerminateTeam(err) {
				return newMessages, nil
			}

			// Fail immediately on any genuine error - emit event for visibility in events view
			t.Recorder.EmitEvent(ctx, corev1.EventTypeWarning, "TeamMemberFailed", BaseEvent{
				Name: member.GetName(),
				Metadata: map[string]string{
					"error":        err.Error(),
					"memberIndex":  fmt.Sprintf("%d", memberIndex),
					"messageCount": fmt.Sprintf("%d", messageCount),
					"strategy":     t.Strategy,
					"teamName":     t.FullName(),
				},
			})
			return newMessages, fmt.Errorf("agent %s failed in team %s: %w", member.GetName(), t.FullName(), err)
		}

		t.TeamRecorder.RecordSuccess(turnSpan)
		turnSpan.End()

		messageCount++                                   // Increment message count
		memberIndex = (memberIndex + 1) % len(t.Members) // Move to next agent in round-robin
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

func MakeTeam(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, recorder EventEmitter, telemetryProvider telemetry.Provider) (*Team, error) {
	members, err := loadTeamMembers(ctx, k8sClient, crd, recorder, telemetryProvider)
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
		Recorder:          recorder,
		TeamRecorder:      telemetryProvider.TeamRecorder(),
		TelemetryProvider: telemetryProvider,
		Client:            k8sClient,
		Namespace:         crd.Namespace,
	}, nil
}

func loadTeamMembers(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, recorder EventEmitter, telemetryProvider telemetry.Provider) ([]TeamMember, error) {
	members := make([]TeamMember, 0, len(crd.Spec.Members))

	for _, memberSpec := range crd.Spec.Members {
		member, err := loadTeamMember(ctx, k8sClient, memberSpec, crd.Namespace, crd.Name, recorder, telemetryProvider)
		if err != nil {
			return nil, err
		}
		members = append(members, member)
	}

	return members, nil
}

func (t *Team) executeWithTracking(tracker *OperationTracker, execFunc func(context.Context, Message, []Message) ([]Message, error), ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	maxTurns := 0
	if t.MaxTurns != nil {
		maxTurns = *t.MaxTurns
	}

	ctx, span := t.TeamRecorder.StartTeamExecution(ctx, t.Name, t.Namespace, t.Strategy, len(t.Members), maxTurns)
	defer span.End()

	// Get the current token usage before team execution
	var tokenCollector *TokenUsageCollector
	if collector, ok := t.Recorder.(*TokenUsageCollector); ok {
		tokenCollector = collector
	}

	var initialTokens TokenUsage
	if tokenCollector != nil {
		initialTokens = tokenCollector.GetTokenSummary()
	}

	result, err := execFunc(ctx, userInput, history)

	// Calculate token usage consumed by this team execution
	var teamTokenUsage TokenUsage
	if tokenCollector != nil {
		finalTokens := tokenCollector.GetTokenSummary()
		teamTokenUsage = TokenUsage{
			PromptTokens:     finalTokens.PromptTokens - initialTokens.PromptTokens,
			CompletionTokens: finalTokens.CompletionTokens - initialTokens.CompletionTokens,
			TotalTokens:      finalTokens.TotalTokens - initialTokens.TotalTokens,
		}
	}

	// Record token usage on team span
	if teamTokenUsage.TotalTokens > 0 {
		t.TeamRecorder.RecordTokenUsage(span, teamTokenUsage.PromptTokens, teamTokenUsage.CompletionTokens, teamTokenUsage.TotalTokens)
	}

	if err != nil {
		t.TeamRecorder.RecordError(span, err)
		if IsTerminateTeam(err) {
			tracker.CompleteWithTermination(err.Error())
			return result, err
		}
		tracker.Fail(err)
		return result, err
	}

	t.TeamRecorder.RecordSuccess(span)
	if teamTokenUsage.TotalTokens > 0 {
		tracker.CompleteWithTokens(teamTokenUsage)
	} else {
		tracker.Complete("")
	}
	return result, err
}

// executeMemberAndAccumulate executes a member and accumulates new messages
func (t *Team) executeMemberAndAccumulate(ctx context.Context, member TeamMember, userInput Message, messages, newMessages *[]Message, turn int) error {
	// Add team and current member to execution metadata for streaming
	ctx = WithExecutionMetadata(ctx, map[string]interface{}{
		"team":  t.Name,
		"agent": member.GetName(),
	})

	memberTracker := NewOperationTracker(t.Recorder, ctx, "TeamMember", member.GetName(), map[string]string{
		"team":       t.FullName(),
		"memberType": member.GetType(),
		"turn":       fmt.Sprintf("%d", turn),
		"queryId":    getQueryID(ctx),
		"sessionId":  getSessionID(ctx),
		"strategy":   t.Strategy,
	})

	result, err := member.Execute(ctx, userInput, *messages, t.memory, t.eventStream)
	if err != nil {
		if IsTerminateTeam(err) {
			memberTracker.CompleteWithTermination(err.Error())
		} else {
			memberTracker.Fail(err)
		}
		// Still accumulate messages even on error if result is not nil
		if result != nil {
			*messages = append(*messages, result.Messages...)
			*newMessages = append(*newMessages, result.Messages...)
		}
		return err
	}

	memberTracker.Complete("")
	*messages = append(*messages, result.Messages...)
	*newMessages = append(*newMessages, result.Messages...)
	return nil
}

func loadTeamMember(ctx context.Context, k8sClient client.Client, memberSpec arkv1alpha1.TeamMember, namespace, teamName string, recorder EventEmitter, telemetryProvider telemetry.Provider) (TeamMember, error) {
	key := types.NamespacedName{Name: memberSpec.Name, Namespace: namespace}

	switch memberSpec.Type {
	case string(agentKey):
		var agentCRD arkv1alpha1.Agent
		if err := k8sClient.Get(ctx, key, &agentCRD); err != nil {
			return nil, fmt.Errorf("failed to get agent %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		return MakeAgent(ctx, k8sClient, &agentCRD, recorder, telemetryProvider)

	case "team":
		var nestedTeamCRD arkv1alpha1.Team
		if err := k8sClient.Get(ctx, key, &nestedTeamCRD); err != nil {
			return nil, fmt.Errorf("failed to get team %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		return MakeTeam(ctx, k8sClient, &nestedTeamCRD, recorder, telemetryProvider)

	default:
		return nil, fmt.Errorf("unsupported member type %s for member %s in team %s", memberSpec.Type, memberSpec.Name, teamName)
	}
}
