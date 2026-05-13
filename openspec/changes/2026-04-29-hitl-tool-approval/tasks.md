## 1. CRD Types & Schema

- [ ] 1.1 Add `ToolInteractionConfig` struct to `ark/api/v1alpha1/agent_types.go` with fields:
  - `Required bool`
  - `Type string` (enum: approval; future: input, confirmation, selection)
  - `Timeout *metav1.Duration`
  - `OnTimeout string` (enum: reject, proceed) with default "reject"
  - **Phase 2**: Type-specific nested configs (e.g., `Approval *ApprovalConfig`)
- [ ] 1.2 Add `Interaction *ToolInteractionConfig` field to `AgentTool` struct in `ark/api/v1alpha1/agent_types.go`
- [ ] 1.3 Add `input-required` to Query status phase enum in `ark/api/v1alpha1/query_types.go`
- [ ] 1.4 Add kubebuilder validation markers:
  - `Timeout` must be positive duration
  - `OnTimeout` enum constraint (reject|proceed) with default "reject"
  - `Type` enum constraint (approval) for MVP
- [ ] 1.5 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

**Note:** No new CRD needed! A2ATask already exists and supports this use case with generic `interactionType` parameter.

## 2. Validation & Webhooks

- [ ] 2.1 Add `validateToolInteractionConfig` function to `ark/internal/validation/agent.go`:
  - Validate timeout format
  - Validate onTimeout enum
  - Validate type enum (only "approval" for MVP)
- [ ] 2.2 Add admission tests for interaction config validation to `ark/internal/webhook/v1/agent_webhook_test.go`

## 3. Completions Executor — Interaction Check

- [ ] 3.1 Create `ark/executors/completions/interaction.go` with:
  - `InteractionRequiredError` type with `InteractionType`, `ToolCalls`, `Config`, and `Context` fields
  - `ExecutionContext` struct with `ConversationID`, `PendingToolCallIndex`, `CompletedToolResults`, `AgentName`, `AgentNamespace`
  - `requiresInteraction(toolName string) *ToolInteractionConfig` function (O(1) lookup)
  - `buildA2ATaskForInteraction(query, toolCalls, config, context) *A2ATask` function
- [ ] 3.2 Add `interactionRequiredTools map[string]*ToolInteractionConfig` field to `Agent` struct
- [ ] 3.3 Populate `interactionRequiredTools` map in `MakeAgent()` for O(1) lookup
- [ ] 3.4 Modify `executeToolCalls()` in `ark/executors/completions/agent.go`:
  - Check interaction requirement before execution
  - Track completed tool results
  - Return `InteractionRequiredError` with minimal execution context (NO conversation history serialization!)
- [ ] 3.5 Add `ResumeFromInteraction()` handler to:
  - Fetch conversation history from memory service using `contextId`
  - Apply `completedToolResults` from A2ATask parameters
  - Handle response based on `interactionType` (MVP: only "approval")
  - Continue execution from `pendingToolCallIndex`
- [ ] 3.6 Create `ark/executors/completions/interaction_test.go` with unit tests:
  - Interaction policy evaluation for different types
  - O(1) lookup performance
  - Resume with memory service integration
  - Type-specific response handling

## 4. Query Controller — Interaction Phase Handling

- [ ] 4.1 Add `PhaseInputRequired = "input-required"` constant to `ark/internal/controller/query_controller.go`
- [ ] 4.2 Modify query reconciliation to handle `InteractionRequiredError` from executor:
  - Create A2ATask with `phase: input-required`, `interactionType`, and interaction parameters
  - Set Query phase to `input-required`
  - Emit streaming event
- [ ] 4.3 Add watch for A2ATask in query controller setup (likely already exists)
- [ ] 4.4 Implement resume logic: when A2ATask transitions to `completed`, re-dispatch query with response
- [ ] 4.5 Handle rejection/failure: when A2ATask transitions to `failed`, update Query phase to `error`

## 5. A2ATask Controller — Timeout Handling

- [ ] 5.1 Extend `ark/internal/controller/a2atask_controller.go` to handle interaction timeouts:
  - Check `spec.parameters.timeout` for tasks with `interactionType` set
  - Handle timeout expiration with optimistic locking
  - Check `status.phase == "input-required"` before applying timeout action
  - Respect `onTimeout` policy: "reject" → `failed`, "proceed" → `completed`
  - Use server-side apply with field manager for conflict detection
  - Update Query phase when timeout expires
- [ ] 5.2 Add unit tests for timeout handling and race conditions

## 6. Event Streaming — Interaction Events

- [ ] 6.1 Define interaction event types in `ark/executors/completions/streaming.go`:
  - `ToolInteractionRequestEvent` — emitted when interaction is needed (includes `interactionType`)
  - `ToolInteractionResponseEvent` — emitted when user responds (includes `interactionType` and response)
- [ ] 6.2 Add `StreamInteractionRequest()` helper function to emit interaction events with full tool context and type
- [ ] 6.3 Update broker event handling in `services/ark-broker/` to recognize new event types

## 7. API Service — Interaction Endpoints with RBAC

- [ ] 7.1 Add `POST /api/v1/namespaces/{namespace}/queries/{name}/interaction` endpoint:
  - Request body: `interactionType`, `toolCallId` (or `toolCallIds`), type-specific response fields
  - Validate response matches expected `interactionType`
  - Authorization: RBAC check for A2ATask update permission
  - Optimistic locking: check phase == `input-required` before update
  - Return HTTP 400 for invalid response format
  - Return HTTP 403 for authorization failure
  - Return HTTP 409 for conflict (phase mismatch)
  - Return updated Query status on success
- [ ] 7.2 Add `GET /api/v1/namespaces/{namespace}/queries/{name}/interaction` endpoint to get pending interaction details
- [ ] 7.3 Add Pydantic models for interaction request/response in `services/ark-api/ark-api/src/ark_api/models/`
  - Generic `InteractionRequest` with type discriminator
  - Type-specific response models (`ApprovalResponse`, `InputResponse`, etc.)
- [ ] 7.4 Add API tests for interaction endpoints including authorization and type validation scenarios

## 8. Dashboard — Interaction UI

- [ ] 8.1 Add interaction notification component to session view:
  - Display when query enters `input-required` phase
  - Show all tool calls in batch with details:
    - Tool name and type
    - Arguments (formatted JSON)
    - Description
    - Annotations (destructiveHint badge, readOnlyHint badge)
    - Agent reasoning
  - Show timeout countdown
  - Show interaction type indicator
- [ ] 8.2 Add type-specific UI controls:
  - `approval`: Approve/Reject buttons (MVP)
  - `input`: Text input field (Phase 2)
  - `confirmation`: Yes/No buttons (Phase 2)
  - `selection`: Option buttons or dropdown (Phase 2)
- [ ] 8.3 Wire interaction responses to API endpoint with type validation
- [ ] 8.4 Add pending interactions indicator to query list view
- [ ] 8.5 Handle real-time interaction events from broker stream
- [ ] 8.6 Display interaction decision confirmation with duration

## 9. A2A Protocol — Reuse Existing State

- [ ] 9.1 Document A2A `input-required` state usage for tool interactions (generic pattern)
- [ ] 9.2 Define A2A interaction message schemas:
  - `application/vnd.ark.tool-interaction-request+json` for requests (generic MIME type)
  - Include `interactionType` field in message data
  - Include `callbackUrl` for executor callback
  - Document type-specific fields (e.g., `options` for selection, `prompt` for input)
- [ ] 9.3 Implement A2A interaction callback handler in controller:
  - POST to `callbackUrl` with response (includes `interactionType` and type-specific fields)
  - Handle callback failures with retry
  - **Security:** Validate callback URLs against SSRF attacks:
    - Reject non-HTTPS URLs
    - Reject URLs pointing to cluster-internal addresses (10.x, 192.168.x, kubernetes.default)
    - Consider allowlist of registered executor endpoints
- [ ] 9.4 Document A2A interaction protocol for custom executor developers (generic + type-specific examples)
- [ ] 9.5 Add chainsaw e2e test for A2A interaction flow (MVP: approval type)

## 10. SDK Support

- [ ] 10.1 Add interaction callback hook to `BaseExecutor` in `lib/ark-sdk/`:
  - `on_interaction_required(interaction_type, tool_calls, timeout, config)` — called when executor needs human input
  - `wait_for_interaction(callback_url)` — polls/waits for callback
  - Document that executors should fetch conversation from memory service on resume
- [ ] 10.2 Add interaction types to SDK:
  - Generic: `ToolInteractionRequest`, `ToolInteractionResponse`, `ToolCallInfo`
  - Type-specific (MVP: approval): `ApprovalRequest`, `ApprovalResponse`
- [ ] 10.3 Document SDK interaction integration in executor developer guide
  - Generic pattern
  - Type-specific examples (MVP: approval)
- [ ] 10.4 Add example executor with HITL support (approval type)

## 11. Samples & Documentation

- [ ] 11.1 Create `samples/agents/hitl-agent.yaml` — agent with interaction-required tools (MVP: approval type)
- [ ] 11.2 Create `samples/queries/hitl-query.yaml` — query demonstrating interaction flow
- [ ] 11.3 Add HITL section to agent reference documentation
  - Generic interaction pattern
  - Type-specific docs (MVP: approval)
- [ ] 11.4 Add interaction workflow guide to user documentation
  - Generic flow diagram
  - Type-specific workflows (MVP: approval)
- [ ] 11.5 Update samples README with HITL examples
- [ ] 11.6 Create migration guide for adding interactions to existing agents
- [ ] 11.7 Document best practices: which tools should require interaction in production vs development
- [ ] 11.8 Add examples of interaction config for common tool types (database, email, deployment)
- [ ] 11.9 Document `onTimeout: proceed` behavior explicitly — it auto-executes the tool, which may surprise users in production; add warning in docs and samples
- [ ] 11.10 Document extensibility: how to add new interaction types in Phase 2

## 12. Testing

- [ ] 12.1 Add Go unit tests for interaction policy evaluation in `ark/executors/completions/interaction_test.go`
  - Generic interaction check logic
  - Type-specific handling (MVP: approval)
- [ ] 12.2 Add Go unit tests for memory service integration on resume
- [ ] 12.3 Add Go unit tests for A2ATask controller timeout handling:
  - Timeout handling with different `onTimeout` policies
  - Optimistic locking
  - Race condition scenarios
- [ ] 12.4 Add performance test: measure interaction check overhead (should be O(1))
- [ ] 12.5 Create chainsaw e2e test: `tests/hitl/chainsaw-test.yaml`
  - Create agent with interaction-required tool (type: approval)
  - Submit query that triggers tool call
  - Verify query enters `input-required` phase
  - Verify A2ATask created with `interactionType: approval` and interaction parameters
  - Submit response via API (approve action)
  - Verify query resumes and completes
  - Verify conversation history fetched from memory service
- [ ] 12.6 Add chainsaw test for interaction rejection flow
- [ ] 12.7 Add chainsaw test for interaction timeout flow (both `reject` and `proceed`)
- [ ] 12.8 Add chainsaw test for batch interaction (multiple tools)
- [ ] 12.9 Add chainsaw test for authorization failure (unauthorized user)
- [ ] 12.10 Add admission failure tests for invalid interaction config
- [ ] 12.11 Add concurrent interaction tests:
  - Multiple simultaneous interaction requests for same Query
  - Response submission while Query is being canceled
  - Concurrent timeout expiration and response submission
- [ ] 12.12 Add test for memory service unavailable scenario during resume
- [ ] 12.13 Add test for invalid `interactionType` in API request (should return 400)

## Phase 2 (Future Enhancements)

**New Interaction Types:**
- [ ] Add `interactionType: "input"` - text input from user
  - `spec.interaction.input.prompt` field
  - `spec.interaction.input.inputType` (text, password, multiline)
  - Dashboard text input field
- [ ] Add `interactionType: "confirmation"` - binary yes/no
  - Simpler than approval (no reject reason, simpler UI)
  - Dashboard yes/no buttons
- [ ] Add `interactionType: "selection"` - choose from options
  - `spec.interaction.selection.options` array
  - Dashboard option buttons or dropdown

**Approval Enhancements:**
- [ ] Add `spec.interaction.approval.approvers` field for role-based authorization
  - Role matching via SubjectAccessReview
  - User and group matching
- [ ] Add `spec.interaction.approval.reasonRequired` for audit compliance
- [ ] Add partial batch response support (`allowPartialResponse: true`)

**General Enhancements:**
- [ ] Add interaction decision caching for idempotent tools
- [ ] Add escalation support for timeout scenarios
- [ ] Add interaction modification (edit tool arguments before execution)
