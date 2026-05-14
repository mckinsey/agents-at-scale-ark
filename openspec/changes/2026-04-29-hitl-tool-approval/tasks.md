## 1. CRD Types & Schema

- [ ] 1.1 Add `ToolApprovalConfig` struct to `ark/api/v1alpha1/agent_types.go` with fields:
  - `Required bool`
  - `Timeout *metav1.Duration`
  - `OnTimeout string` (enum: reject, proceed) with default "reject"
  - **Phase 2**: Approval-specific nested configs (e.g., `Approvers []string`, `ReasonRequired bool`)
- [ ] 1.2 Add `Approval *ToolApprovalConfig` field to `AgentTool` struct in `ark/api/v1alpha1/agent_types.go`
- [ ] 1.3 Add `input-required` to Query status phase enum in `ark/api/v1alpha1/query_types.go`
- [ ] 1.4 Add kubebuilder validation markers:
  - `Timeout` must be positive duration
  - `OnTimeout` enum constraint (reject|proceed) with default "reject"
- [ ] 1.5 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

**Note:** No new CRD needed! A2ATask already exists and supports this use case.

## 2. Validation & Webhooks

- [ ] 2.1 Add `validateToolApprovalConfig` function to `ark/internal/validation/agent.go`:
  - Validate timeout format
  - Validate onTimeout enum
- [ ] 2.2 Add admission tests for approval config validation to `ark/internal/webhook/v1/agent_webhook_test.go`

## 3. Completions Executor — Approval Check

- [ ] 3.1 Create `ark/executors/completions/approval.go` with:
  - `ApprovalRequiredError` type with `ToolCalls`, `Config`, and `Context` fields
  - `ExecutionContext` struct with `ConversationID`, `PendingToolCallIndex`, `CompletedToolResults`, `AgentName`, `AgentNamespace`
  - `requiresApproval(toolName string) *ToolApprovalConfig` function (O(1) lookup)
  - `buildA2ATaskForApproval(query, toolCalls, config, context) *A2ATask` function
- [ ] 3.2 Add `approvalRequiredTools map[string]*ToolApprovalConfig` field to `Agent` struct
- [ ] 3.3 Populate `approvalRequiredTools` map in `MakeAgent()` for O(1) lookup
- [ ] 3.4 Modify `executeToolCalls()` in `ark/executors/completions/agent.go`:
  - Check approval requirement before execution
  - Track completed tool results
  - Return `ApprovalRequiredError` with minimal execution context (NO conversation history serialization!)
- [ ] 3.5 Add `ResumeFromApproval()` handler to:
  - Fetch conversation history from memory service using `contextId`
  - Apply `completedToolResults` from A2ATask parameters
  - Handle approval response (approved/rejected)
  - Continue execution from `pendingToolCallIndex`
- [ ] 3.6 Create `ark/executors/completions/approval_test.go` with unit tests:
  - Approval policy evaluation
  - O(1) lookup performance
  - Resume with memory service integration
  - Response handling

## 4. Query Controller — Approval Phase Handling

- [ ] 4.1 Add `PhaseInputRequired = "input-required"` constant to `ark/internal/controller/query_controller.go`
- [ ] 4.2 Modify query reconciliation to handle `ApprovalRequiredError` from executor:
  - Create A2ATask with `phase: input-required` and approval parameters
  - Set Query phase to `input-required`
  - Emit streaming event
- [ ] 4.3 Add watch for A2ATask in query controller setup (likely already exists)
- [ ] 4.4 Implement resume logic: when A2ATask transitions to `completed`, re-dispatch query with response
- [ ] 4.5 Handle rejection/failure: when A2ATask transitions to `failed`, update Query phase to `error`

## 5. A2ATask Controller — Timeout Handling

- [ ] 5.1 Extend `ark/internal/controller/a2atask_controller.go` to handle approval timeouts:
  - Check `spec.parameters.timeout` for approval tasks
  - Handle timeout expiration with optimistic locking
  - Check `status.phase == "input-required"` before applying timeout action
  - Respect `onTimeout` policy: "reject" → `failed`, "proceed" → `completed`
  - Use server-side apply with field manager for conflict detection
  - Update Query phase when timeout expires
- [ ] 5.2 Add unit tests for timeout handling and race conditions

## 6. Event Streaming — Approval Events

- [ ] 6.1 Define approval event types in `ark/executors/completions/streaming.go`:
  - `ToolApprovalRequestEvent` — emitted when approval is needed
  - `ToolApprovalResponseEvent` — emitted when user responds
- [ ] 6.2 Add `StreamApprovalRequest()` helper function to emit approval events with full tool context
- [ ] 6.3 Update broker event handling in `services/ark-broker/` to recognize new event types

## 7. API Service — Approval Endpoints with RBAC

- [ ] 7.1 Add `POST /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint:
  - Request body: `action` (approved/rejected), `toolCallId` (or `toolCallIds`)
  - Authorization: RBAC check for A2ATask update permission
  - Optimistic locking: check phase == `input-required` before update
  - Return HTTP 403 for authorization failure
  - Return HTTP 409 for conflict (phase mismatch)
  - Return updated Query status on success
- [ ] 7.2 Add `GET /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint to get pending approval details
- [ ] 7.3 Add Pydantic models for approval request/response in `services/ark-api/ark-api/src/ark_api/models/`
  - `ApprovalRequest` with action field
  - `ApprovalResponse` model
- [ ] 7.4 Add API tests for approval endpoints including authorization scenarios

## 8. Dashboard — Approval UI

- [ ] 8.1 Add approval notification component to session view:
  - Display when query enters `input-required` phase
  - Show all tool calls in batch with details:
    - Tool name and type
    - Arguments (formatted JSON)
    - Description
    - Annotations (destructiveHint badge, readOnlyHint badge)
    - Agent reasoning
  - Show timeout countdown
- [ ] 8.2 Add Approve/Reject buttons
- [ ] 8.3 Wire approval responses to API endpoint
- [ ] 8.4 Add pending approvals indicator to query list view
- [ ] 8.5 Handle real-time approval events from broker stream
- [ ] 8.6 Display approval decision confirmation with duration

## 9. A2A Protocol — Use input-required State

- [ ] 9.1 Document A2A `input-required` state usage for tool approvals (aligns with A2A standard)
- [ ] 9.2 Define A2A approval message schemas:
  - `application/vnd.ark.tool-approval-request+json` MIME type
  - Include `callbackUrl` for executor callback
- [ ] 9.3 Implement A2A approval callback handler in controller:
  - POST to `callbackUrl` with approval response
  - Handle callback failures with retry
  - **Security:** Validate callback URLs against SSRF attacks:
    - Reject non-HTTPS URLs
    - Reject URLs pointing to cluster-internal addresses (10.x, 192.168.x, kubernetes.default)
    - Consider allowlist of registered executor endpoints
- [ ] 9.4 Document A2A approval protocol for custom executor developers
- [ ] 9.5 Add chainsaw e2e test for A2A approval flow

## 10. SDK Support

- [ ] 10.1 Add approval callback hook to `BaseExecutor` in `lib/ark-sdk/`:
  - `on_approval_required(tool_calls, timeout, config)` — called when executor needs human approval
  - `wait_for_approval(callback_url)` — polls/waits for callback
  - Document that executors should fetch conversation from memory service on resume
- [ ] 10.2 Add approval types to SDK:
  - `ApprovalRequest`, `ApprovalResponse`, `ToolCallInfo`
- [ ] 10.3 Document SDK approval integration in executor developer guide
- [ ] 10.4 Add example executor with approval support

## 11. Samples & Documentation

- [ ] 11.1 Create `samples/agents/hitl-agent.yaml` — agent with approval-required tools
- [ ] 11.2 Create `samples/queries/hitl-query.yaml` — query demonstrating approval flow
- [ ] 11.3 Add HITL section to agent reference documentation
  - Tool approval pattern
  - Configuration options
- [ ] 11.4 Add approval workflow guide to user documentation
  - Flow diagram
  - API usage examples
- [ ] 11.5 Update samples README with HITL examples
- [ ] 11.6 Create migration guide for adding approval to existing agents
- [ ] 11.7 Document best practices: which tools should require approval in production vs development
- [ ] 11.8 Add examples of approval config for common tool types (database, email, deployment)
- [ ] 11.9 Document `onTimeout: proceed` behavior explicitly — it auto-executes the tool, which may surprise users in production; add warning in docs and samples

## 12. Testing

- [ ] 12.1 Add Go unit tests for approval policy evaluation in `ark/executors/completions/approval_test.go`
  - Approval check logic
  - Response handling
- [ ] 12.2 Add Go unit tests for memory service integration on resume
- [ ] 12.3 Add Go unit tests for A2ATask controller timeout handling:
  - Timeout handling with different `onTimeout` policies
  - Optimistic locking
  - Race condition scenarios
- [ ] 12.4 Add performance test: measure approval check overhead (should be O(1))
- [ ] 12.5 Create chainsaw e2e test: `tests/hitl/chainsaw-test.yaml`
  - Create agent with approval-required tool
  - Submit query that triggers tool call
  - Verify query enters `input-required` phase
  - Verify A2ATask created with approval parameters
  - Submit response via API (approve action)
  - Verify query resumes and completes
  - Verify conversation history fetched from memory service
- [ ] 12.6 Add chainsaw test for approval rejection flow
- [ ] 12.7 Add chainsaw test for approval timeout flow (both `reject` and `proceed`)
- [ ] 12.8 Add chainsaw test for batch approval (multiple tools)
- [ ] 12.9 Add chainsaw test for authorization failure (unauthorized user)
- [ ] 12.10 Add admission failure tests for invalid approval config
- [ ] 12.11 Add concurrent approval tests:
  - Multiple simultaneous approval requests for same Query
  - Response submission while Query is being canceled
  - Concurrent timeout expiration and response submission
- [ ] 12.12 Add test for memory service unavailable scenario during resume

## Phase 2 (Future Enhancements)

**Approval Enhancements:**
- [ ] Add `spec.approval.approvers` field for role-based authorization
  - Role matching via SubjectAccessReview
  - User and group matching
- [ ] Add `spec.approval.reasonRequired` for audit compliance
- [ ] Add partial batch response support (`allowPartialResponse: true`)

**General Enhancements:**
- [ ] Add approval decision caching for idempotent tools
- [ ] Add escalation support for timeout scenarios
