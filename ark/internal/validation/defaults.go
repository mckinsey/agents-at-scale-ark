package validation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	admissionv1 "k8s.io/api/admission/v1"
	"sigs.k8s.io/controller-runtime/pkg/webhook/admission"

	arkv1alpha1 "mckinsey.com/ark/api/v1alpha1"
	"mckinsey.com/ark/internal/annotations"
	"mckinsey.com/ark/internal/resolution"
)

const (
	toolTypeCustom  = "custom"
	toolTypeBuiltIn = "built-in"
)

func DefaultAgent(agent *arkv1alpha1.Agent) {
	_, isA2A := agent.Annotations[annotations.A2AServerName]
	hasModel := agent.Spec.ModelRef != nil

	if !hasModel && !isA2A {
		agent.Spec.ModelRef = &arkv1alpha1.AgentModelRef{
			Name: "default",
		}
	}

	for _, tool := range agent.Spec.Tools {
		if tool.Type == toolTypeCustom {
			if agent.Annotations == nil {
				agent.Annotations = make(map[string]string)
			}
			agent.Annotations[annotations.MigrationWarningPrefix+"tool-type-custom"] = fmt.Sprintf(
				"agent '%s' tool '%s': type 'custom' is deprecated, use the tool's actual type (mcp, http, agent, team, builtin) instead",
				agent.Name,
				tool.Name,
			)
			break
		}
	}
}

func DefaultTeam(team *arkv1alpha1.Team) {
	loopsTrue := true
	loopsFalse := false

	switch team.Spec.Strategy {
	case StrategyRoundRobin:
		if team.Annotations == nil {
			team.Annotations = make(map[string]string)
		}

		if team.Spec.MaxTurns != nil {
			team.Spec.Strategy = StrategySequential
			team.Spec.Loops = &loopsTrue
			team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential' with loops: true. Will be removed in v1.0.0"
		} else {
			team.Spec.Strategy = StrategySequential
			team.Spec.Loops = &loopsFalse
			team.Annotations[annotations.MigrationWarningPrefix+"round-robin"] = "strategy 'round-robin' is deprecated - migrated to 'sequential'. Set loops: true and maxTurns to enable looping. Will be removed in v1.0.0"
		}

	case StrategySelector:
		if team.Spec.Selector != nil && team.Spec.Selector.SelectorPrompt != "" &&
			!strings.Contains(team.Spec.Selector.SelectorPrompt, "select-next-speaker") {
			if team.Annotations == nil {
				team.Annotations = make(map[string]string)
			}
			team.Annotations[annotations.MigrationWarningPrefix+"selector-prompt"] = "custom selectorPrompt should instruct the agent to use the select-next-speaker tool — add 'Use the select-next-speaker tool to make your selection.' to your selectorPrompt"
		}

	case StrategyGraph:
		if team.Annotations == nil {
			team.Annotations = make(map[string]string)
		}

		team.Spec.Strategy = StrategySequential
		team.Spec.Loops = &loopsFalse
		team.Spec.Graph = nil
		team.Spec.MaxTurns = nil
		team.Annotations[annotations.MigrationWarningPrefix+"graph"] = "strategy 'graph' is deprecated - migrated to 'sequential'. Graph edges have been discarded. Will be removed in v1.0.0"
	}
}

func DefaultQuery(ctx context.Context, query *arkv1alpha1.Query, lookup DefaultsLookup) {
	if query.Spec.Type == "messages" {
		userText, err := resolution.ExtractFirstUserText(json.RawMessage(query.Spec.Input.Raw))
		if err != nil {
			userText = ""
		}

		query.Spec.Type = arkv1alpha1.QueryTypeUser
		_ = query.Spec.SetInputString(userText)

		if query.Annotations == nil {
			query.Annotations = make(map[string]string)
		}
		query.Annotations[annotations.MigrationWarningPrefix+"input-type"] = "spec.type 'messages' is deprecated - migrated to 'user' with extracted text. Use conversationId for multi-turn conversations"
	}

	if query.Spec.TTL == nil {
		ttl := ResolveQueryTTL(ctx, lookup)
		query.Spec.TTL = &ttl
	}

	if query.Spec.Memory == nil {
		query.Spec.Memory = resolveInjectableMemory(ctx, query.Namespace, lookup)
	}
}

// resolveInjectableMemory returns the cluster-wide default Memory only when it
// is usable from the query namespace. Existence is not enough: a Memory whose
// address never resolved has no status.lastResolvedAddress, and naming it makes
// NewHTTPMemory fail the query. Note this only helps for a name other than
// "default" — the executor's own fallback looks that one up by existence too,
// so an unresolved Memory/default fails the namespace either way.
// Injection is create-only, so a query is never stamped after the fact with a
// memory it did not use.
func resolveInjectableMemory(ctx context.Context, namespace string, lookup DefaultsLookup) *arkv1alpha1.MemoryRef {
	if lookup == nil || namespace == "" || !isCreateAdmission(ctx) {
		return nil
	}
	ref := ResolveDefaultMemory(ctx, lookup)
	if ref == nil {
		return nil
	}
	obj, err := lookup.GetResource(ctx, "Memory", namespace, ref.Name)
	if err != nil {
		return nil
	}
	memory, ok := obj.(*arkv1alpha1.Memory)
	if !ok || memory.Status.LastResolvedAddress == nil || *memory.Status.LastResolvedAddress == "" {
		return nil
	}
	return ref
}

// isCreateAdmission reports whether ctx carries a CREATE admission request.
// The mutating webhook is registered for create and update, and spec.memory is
// nil on every query that predates the field or ran without a memory backend —
// re-running the rule on a later update would rewrite that history.
func isCreateAdmission(ctx context.Context) bool {
	req, err := admission.RequestFromContext(ctx)
	if err != nil {
		return false
	}
	return req.Operation == admissionv1.Create
}

func DefaultModel(model *arkv1alpha1.Model) {
	if model.Spec.Provider == "" && IsDeprecatedProviderInType(model.Spec.Type) {
		originalType := model.Spec.Type
		model.Spec.Provider = model.Spec.Type
		model.Spec.Type = ModelTypeCompletions

		if model.Annotations == nil {
			model.Annotations = make(map[string]string)
		}
		model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
			"spec.type is deprecated for provider values - migrated '%s' to spec.provider",
			originalType,
		)
	}

	if model.Spec.Provider == ProviderBedrock && model.Spec.Config.Bedrock != nil {
		bedrock := model.Spec.Config.Bedrock
		hasAPIKey := bedrock.APIKey != nil
		hasIAM := bedrock.AccessKeyID != nil || bedrock.SecretAccessKey != nil
		if hasAPIKey && hasIAM {
			if model.Annotations == nil {
				model.Annotations = make(map[string]string)
			}
			model.Annotations[annotations.MigrationWarningPrefix+"bedrock-auth"] = "both apiKey and IAM credentials are set for the bedrock provider - apiKey takes precedence and the IAM credentials are ignored"
		}
	}
}
