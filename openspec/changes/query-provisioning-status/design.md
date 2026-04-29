## Context

When a Query targets an agent with an external ExecutionEngine, the controller dispatches the request via A2A and blocks waiting for the response. If the executor needs to provision infrastructure (e.g., sandbox pod), there's a 10-60 second gap where the Query shows "running" but nothing is executing. The executor is the component that knows about provisioning — it decides when infrastructure is needed and when it's ready.

The Query CRD currently has 5 phases: `pending`, `running`, `done`, `error`, `canceled`. The "Completed" condition tracks terminal state with structured reasons (`QueryNotStarted`, `QueryRunning`, `QuerySucceeded`, `QueryErrored`, `QueryCanceled`). The dashboard renders phases as colored StatusDots; the fark CLI uses a QueryWatcher with a spinner.

The ark-sdk already extracts the query ref (name + namespace) from A2A message metadata and has K8s API access to fetch Query, Agent, and Model CRDs during request resolution.

## Goals / Non-Goals

**Goals:**
- Users see a distinct visual state when infrastructure is being provisioned
- Any executor can optionally signal provisioning via a generic SDK utility
- The mechanism uses existing K8s patterns (status subresource, conditions)
- Zero changes to the controller's dispatch logic or A2A protocol

**Non-Goals:**
- Granular provisioning progress (e.g., "pulling image", "scheduling pod") — a single phase is sufficient
- Standalone executor provisioning — only relevant when provisioning happens during query execution
- Executor-to-controller callback protocol — executor patches Query directly via K8s API
- Changes to the controller's role as terminal-phase writer

## Decisions

### 1. Out-of-band status update via K8s API

**Decision**: The executor patches the Query CRD status subresource directly via K8s API.

**Alternatives considered**:
- *A2A protocol extension*: Executor sends intermediate task status updates. Requires the controller to handle non-blocking A2A dispatch — a larger change.
- *Status callback URL*: Controller includes a webhook URL in A2A metadata; executor POSTs updates to it. Universal but requires a new endpoint.

**Rationale**: The executor already has K8s API access and the query ref from A2A metadata. Patching the status subresource is one additional API call with no new infrastructure.

### 2. Single new phase: "provisioning"

**Decision**: Add `provisioning` to the Query phase enum. State machine becomes: `pending → provisioning → running → done/error/canceled`.

**Alternatives considered**:
- *Multiple intermediate phases* (dispatching, provisioning, initializing): More granular but marginal user benefit.
- *Condition-only signal* (keep "running", add a condition): Phase is what interfaces switch on for visual state. Condition-only would require UI changes to inspect conditions.

**Rationale**: Phase is the primary status indicator. One new value is the minimum change for a distinct visual signal.

### 3. Reuse existing Condition with new Reason

**Decision**: The executor sets the "Completed" condition with `reason: ExecutorProvisioning` and a freeform `message`. No new condition types.

**Rationale**: The Condition's Reason field already uses PascalCase conventions. Adding `ExecutorProvisioning` follows the pattern. The Message field is already freeform. No schema changes needed.

### 4. Live with the brief running → provisioning transition

**Decision**: The controller sets `phase=running` at dispatch (unchanged). The executor overrides to `provisioning` milliseconds later. No controller changes.

**Alternatives considered**:
- *Controller defers "running"*: Stays at "pending" after dispatch. Breaks backward compatibility — old executors would leave queries at "pending" until "done."

**Rationale**: The transition is milliseconds. No observer polling at normal intervals would see it. Full backward compatibility preserved.

### 5. SDK utility injected alongside broker_client

**Decision**: Add `QueryStatusUpdater` to ark-sdk, injected into executor context by `A2AExecutorAdapter`. Optional — executors that don't call it behave as today.

**Rationale**: Follows existing extension pattern. The adapter already extracts the query ref. The updater needs that ref plus K8s API access, both already available.

### 6. Best-effort semantics

**Decision**: Status updates are best-effort. Missing query ref logs a warning. K8s API failures log an error. Neither blocks execution.

**Rationale**: Provisioning status is a UX enhancement, not a correctness requirement. An executor failing to report status should not prevent query execution.

## Risks / Trade-offs

**[Brief phase regression]** → Query phase goes running → provisioning → running in the first milliseconds after dispatch. Not observable at normal polling intervals. Provisioning phase lasts 10-60 seconds.

**[RBAC expansion]** → Executors gain `patch` on `queries/status`. Scoped by namespace. Status subresource is separate from spec — executors cannot modify query inputs.

**[Second writer on Query status]** → The controller is currently the sole writer. This introduces a second writer for intermediate phases only. Terminal phases (done, error, canceled) remain controller-only. Race condition: if controller processes response before executor patches to "running", phase goes provisioning → done, skipping "running." This is harmless.
