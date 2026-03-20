## Context

The Ark dashboard provides management UIs for agents, teams, models, and other resources. Each has dedicated API endpoints in ark-api that transform K8s CRDs into clean response types, with generated TypeScript types consumed by dashboard services.

Execution engines (CRD `v1prealpha1`) lack dedicated API endpoints. They are only accessible through the generic resource API (`/v1/resources/apis/{group}/{version}/{kind}`), which returns raw K8s objects. The dashboard currently has a mock engines service with hardcoded test data and a free-text input field behind an experimental feature flag.

## Goals / Non-Goals

**Goals:**
- Let users see execution engines and their health status in the dashboard
- Let users select execution engines from a validated dropdown when configuring agents
- Follow existing dashboard patterns (services, hooks, sections, cards) for consistency
- Agent availability reflects execution engine existence and readiness, matching the model/tool dependency pattern

**Non-Goals:**
- Create/edit execution engines in the dashboard (kubectl is sufficient while experimental)
- Add dedicated API endpoints to ark-api (deferred to when engines graduate from experimental)
- Change the experimental feature flag gating — everything stays behind the existing flag
- Handle engine-aware form behavior (e.g., hiding prompt when an engine is selected)

## Decisions

### 1. Call generic resource API directly from dashboard service

The dashboard engines service will call `/api/v1/resources/apis/ark.mckinsey.com/v1prealpha1/ExecutionEngine` and normalize the raw K8s response into a clean TypeScript type.

**Alternative considered**: Add dedicated endpoints to ark-api (like agents/models have). Rejected because execution engines are still experimental and this would require changes across ark-api Python service, OpenAPI spec regeneration, and SDK type generation — disproportionate for read-only experimental UI.

**Future**: When execution engines graduate from experimental, promote to dedicated API endpoints. A TODO comment in the service will mark this.

### 2. Manual TypeScript type for K8s CRD response

Define an `ExecutionEngineResource` type matching the raw K8s object shape, and an `ExecutionEngine` type for the normalized dashboard-friendly shape. The service layer handles the transformation.

```
K8s shape:                          Dashboard shape:
{                                   {
  metadata: { name, namespace },      name: string
  spec: { description },       →      description?: string
  status: {                           phase: 'ready' | 'running' | 'error'
    phase, lastResolvedAddress,       resolvedAddress?: string
    message                           statusMessage?: string
  }                                 }
}
```

### 3. Reuse existing experimental feature flag

The `isExperimentalExecutionEngineEnabledAtom` already gates the engine field in Agent Studio. Reuse it for the list page and sidebar entry.

### 4. Sidebar placement in "More" popover

The "More" popover currently holds Files, A2A Tasks, and Exports. Execution Engines will be added here, conditionally rendered when the experimental flag is on. This keeps the main sidebar uncluttered while the feature is experimental.

### 5. Phase status indicators

Use colored dots consistent with K8s conventions:
- `ready` → green
- `running` → yellow
- `error` → red

Shown in both the dropdown options and the list page cards.

### 6. Agent controller watches ExecutionEngine resources

The agent controller currently checks model, tool, and A2AServer dependencies but not execution engines. This creates a gap where an agent references a deleted or unhealthy engine but still reports as "Available" — queries then fail at runtime.

Add to the agent reconciler:
- `checkExecutionEngineDependency()` — validates the referenced engine exists and has phase "ready". Returns `"ExecutionEngineNotFound"` or `"ExecutionEngineNotReady"` reasons.
- `Watches(&arkv1prealpha1.ExecutionEngine{}, ...)` — triggers agent re-reconciliation when an engine is created, updated, or deleted.
- `findAgentsForExecutionEngine()` and `agentDependsOnExecutionEngine()` — maps engine events to dependent agents using the existing `findAgentsForDependency()` helper.
- RBAC marker for `executionengines` get/list/watch.

This mirrors the model dependency pattern exactly: check existence, check readiness condition (phase for engines), and watch for changes.

## Risks / Trade-offs

**Manual types may drift from CRD** → Mitigated by the type being simple (5 fields). When promoting to dedicated API endpoints, generated types will replace manual ones.

**Generic resource API returns all fields including full spec.address ValueSource** → Service extracts only what the UI needs. No sensitive data exposure risk since the dashboard already requires authentication.

**No create/edit means users must switch to kubectl** → Acceptable for experimental. The list page with status visibility already adds significant value over pure kubectl.

**ExecutionEngine is v1prealpha1, Agent is v1alpha1** → Cross-version dependency is already precedented by A2AServer (also v1prealpha1) being watched by the agent controller.
