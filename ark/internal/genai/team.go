package genai

import (
	"context"
	"fmt"
	"slices"

	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
)

type Team struct {
	Name        string
	Members     []TeamMember
	Strategy    string
	Description string
	MaxTurns    *int
	Selector    *arkv1alpha1.TeamSelectorSpec
	Graph       *arkv1alpha1.TeamGraphSpec
	Recorder    EventEmitter
	Client      client.Client
	Namespace   string
}

// FullName returns the namespace/name format for the team
func (t *Team) FullName() string {
	return t.Namespace + "/" + t.Name
}

func (t *Team) Execute(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	if len(t.Members) == 0 {
		return nil, fmt.Errorf("team %s has no members configured", t.FullName())
	}

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

	return t.executeWithTracking(teamTracker, execFunc, ctx, userInput, history)
}

func (t *Team) executeSequential(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := slices.Clone(history)
	var newMessages []Message

	for i, member := range t.Members {
		// Check if context was cancelled
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		if err := t.executeMemberAndAccumulate(ctx, member, userInput, &messages, &newMessages, i); err != nil {
			if IsTerminateTeam(err) {
				return newMessages, nil
			}
			return newMessages, err
		}
	}

	return newMessages, nil
}

func (t *Team) executeRoundRobin(ctx context.Context, userInput Message, history []Message) ([]Message, error) {
	messages := slices.Clone(history)
	var newMessages []Message

	for turn := 0; ; turn++ {
		// Check if context was cancelled
		if ctx.Err() != nil {
			return newMessages, ctx.Err()
		}

		turnTracker := NewExecutionRecorder(t.Recorder)
		turnTracker.TeamTurn(ctx, "Start", t.FullName(), t.Strategy, turn)

		for i, member := range t.Members {
			// Check if context was cancelled before each member execution
			if ctx.Err() != nil {
				return newMessages, ctx.Err()
			}

			if err := t.executeMemberAndAccumulate(ctx, member, userInput, &messages, &newMessages, i); err != nil {
				if IsTerminateTeam(err) {
					return newMessages, nil
				}
				return newMessages, err
			}
		}

		if t.MaxTurns != nil && turn+1 >= *t.MaxTurns {
			turnTracker.TeamTurn(ctx, "MaxTurns", t.FullName(), t.Strategy, turn+1)
			return newMessages, fmt.Errorf("team round-robin MaxTurns reached %s", t.GetName())
		}
	}
}

func (t *Team) GetName() string {
	return t.Name
}

func (t *Team) GetType() string {
	return "team"
}

func (t *Team) GetDescription() string {
	return t.Description
}

func MakeTeam(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, recorder EventEmitter) (*Team, error) {
	members, err := loadTeamMembers(ctx, k8sClient, crd, recorder)
	if err != nil {
		return nil, err
	}

	return &Team{
		Name:        crd.Name,
		Members:     members,
		Strategy:    crd.Spec.Strategy,
		Description: crd.Spec.Description,
		MaxTurns:    crd.Spec.MaxTurns,
		Selector:    crd.Spec.Selector,
		Graph:       crd.Spec.Graph,
		Recorder:    recorder,
		Client:      k8sClient,
		Namespace:   crd.Namespace,
	}, nil
}

func loadTeamMembers(ctx context.Context, k8sClient client.Client, crd *arkv1alpha1.Team, recorder EventEmitter) ([]TeamMember, error) {
	members := make([]TeamMember, 0, len(crd.Spec.Members))

	for _, memberSpec := range crd.Spec.Members {
		member, err := loadTeamMember(ctx, k8sClient, memberSpec, crd.Namespace, crd.Name, recorder)
		if err != nil {
			return nil, err
		}
		members = append(members, member)
	}

	return members, nil
}

func (t *Team) executeWithTracking(tracker *OperationTracker, execFunc func(context.Context, Message, []Message) ([]Message, error), ctx context.Context, userInput Message, history []Message) ([]Message, error) {
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

	if err != nil {
		if IsTerminateTeam(err) {
			tracker.CompleteWithTermination(err.Error())
			return result, err
		}
		tracker.Fail(err)
		return result, err
	}

	if teamTokenUsage.TotalTokens > 0 {
		tracker.CompleteWithTokens("", teamTokenUsage)
	} else {
		tracker.Complete("")
	}
	return result, err
}

// executeMemberAndAccumulate executes a member and accumulates new messages
func (t *Team) executeMemberAndAccumulate(ctx context.Context, member TeamMember, userInput Message, messages, newMessages *[]Message, turn int) error {
	memberTracker := NewOperationTracker(t.Recorder, ctx, "TeamMember", member.GetName(), map[string]string{
		"team":       t.FullName(),
		"memberType": member.GetType(),
		"turn":       fmt.Sprintf("%d", turn),
		"queryId":    getQueryID(ctx),
		"sessionId":  getSessionID(ctx),
		"strategy":   t.Strategy,
	})

	memberNewMessages, err := member.Execute(ctx, userInput, *messages)
	if err != nil {
		if IsTerminateTeam(err) {
			memberTracker.CompleteWithTermination(err.Error())
		} else {
			memberTracker.Fail(err)
		}
		// Still accumulate messages even on error
		*messages = append(*messages, memberNewMessages...)
		*newMessages = append(*newMessages, memberNewMessages...)
		return err
	}

	memberTracker.Complete("")
	*messages = append(*messages, memberNewMessages...)
	*newMessages = append(*newMessages, memberNewMessages...)
	return nil
}

func loadTeamMember(ctx context.Context, k8sClient client.Client, memberSpec arkv1alpha1.TeamMember, namespace, teamName string, recorder EventEmitter) (TeamMember, error) {
	key := types.NamespacedName{Name: memberSpec.Name, Namespace: namespace}

	switch memberSpec.Type {
	case "agent":
		var agentCRD arkv1alpha1.Agent
		if err := k8sClient.Get(ctx, key, &agentCRD); err != nil {
			return nil, fmt.Errorf("failed to get agent %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		return MakeAgent(ctx, k8sClient, &agentCRD, recorder)

	case "team":
		var nestedTeamCRD arkv1alpha1.Team
		if err := k8sClient.Get(ctx, key, &nestedTeamCRD); err != nil {
			return nil, fmt.Errorf("failed to get team %s for team %s: %w", memberSpec.Name, teamName, err)
		}
		return MakeTeam(ctx, k8sClient, &nestedTeamCRD, recorder)

	default:
		return nil, fmt.Errorf("unsupported member type %s for member %s in team %s", memberSpec.Type, memberSpec.Name, teamName)
	}
}
