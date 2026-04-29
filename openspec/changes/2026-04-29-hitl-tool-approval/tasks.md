## 1. CRD Types & Schema

- [ ] 1.1 Add `ToolApprovalConfig` struct to `ark/api/v1alpha1/agent_types.go` with fields:
  - `Required bool`
  - `Timeout *metav1.Duration`
  - `OnTimeout string` (enum: reject, proceed) with default "reject"
  - `Approvers []ApproverRef` (role or user references)
  - `ReasonRequired bool`
- [ ] 1.2 Add `ApproverRef` struct with `Role string` and `User string` fields
- [ ] 1.3 Add `Approval *ToolApprovalConfig` field to `AgentTool` struct in `ark/api/v1alpha1/agent_types.go`
- [ ] 1.4 Add `approval-required` to Query status phase enum in `ark/api/v1alpha1/query_types.go`
- [ ] 1.5 Create `ark/api/v1alpha1/toolapprovalrequest_types.go` with `ToolApprovalRequest` CRD:
  - Spec: `QueryRef`, `ToolCalls []ToolCallInfo` (batch support), `Timeout`, `OnTimeout`, `Approvers`, `ReasonRequired`, `ExecutionContext`
  - `ToolCallInfo`: `ID`, `Name`, `Type`, `Arguments`, `Description`, `Annotations`, `AgentReasoning`
  - `ExecutionContext`: `ConversationHistory`, `PendingToolCallIndex`, `CompletedToolResults`, `AgentName`, `AgentNamespace`
  - Status: `Phase`, `ObservedGeneration`, `RequestedAt`, `Decision`, `ApprovalDuration`
  - `Decision`: `Action`, `DecidedBy`, `DecidedAt`, `Reason`, `ClientContext`
  - `ClientContext`: `IPAddress`, `UserAgent`
- [ ] 1.6 Add kubebuilder validation markers:
  - `Timeout` must be positive duration
  - `OnTimeout` enum constraint (reject|proceed) with default "reject"
  - `Phase` enum constraint (pending|approved|rejected|expired)
- [ ] 1.7 Add `ToolApprovalRequest` to scheme registration in `ark/api/v1alpha1/groupversion_info.go`
- [ ] 1.8 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

## 2. Validation & Webhooks

- [ ] 2.1 Add `validateToolApprovalConfig` function to `ark/internal/validation/agent.go`:
  - Validate timeout format
  - Validate onTimeout enum
  - Validate approvers structure
- [ ] 2.2 Add validation webhook for ToolApprovalRequest in `ark/internal/webhook/v1/`:
  - Validate phase transitions (pending → approved/rejected/expired only)
  - Validate required fields
  - Validate observedGeneration for optimistic locking
- [ ] 2.3 Add admission tests for approval config validation to `ark/internal/webhook/v1/agent_webhook_test.go`
- [ ] 2.4 Add admission tests for ToolApprovalRequest validation

## 3. Completions Executor — Approval Check

- [ ] 3.1 Create `ark/executors/completions/approval.go` with:
  - `ApprovalRequiredError` type with `ToolCalls` and `Context` fields
  - `ExecutionContext` struct for state persistence
  - `requiresApproval(toolName string) *ToolApprovalConfig` function (O(1) lookup)
  - `buildApprovalRequest(query, toolCalls, config, context) *ToolApprovalRequest` function
  - `serializeMessages(messages []Message) string` for context persistence
  - `deserializeMessages(data string) []Message` for context restoration
- [ ] 3.2 Add `approvalRequiredTools map[string]*ToolApprovalConfig` field to `Agent` struct
- [ ] 3.3 Populate `approvalRequiredTools` map in `MakeAgent()` for O(1) lookup
- [ ] 3.4 Modify `executeToolCalls()` in `ark/executors/completions/agent.go`:
  - Check approval requirement before execution
  - Track completed tool results
  - Return `ApprovalRequiredError` with full execution context
- [ ] 3.5 Add `ResumeFromApproval()` handler to restore context and continue execution
- [ ] 3.6 Create `ark/executors/completions/approval_test.go` with unit tests:
  - Approval policy evaluation
  - Context serialization/deserialization
  - O(1) lookup performance

## 4. Query Controller — Approval Phase Handling

- [ ] 4.1 Add `PhaseApprovalRequired = "approval-required"` constant to `ark/internal/controller/query_controller.go`
- [ ] 4.2 Modify query reconciliation to handle `ApprovalRequiredError` from executor:
  - Create ToolApprovalRequest CRD with full execution context
  - Set Query phase to `approval-required`
  - Emit streaming event
- [ ] 4.3 Add watch for ToolApprovalRequest in query controller setup
- [ ] 4.4 Implement resume logic: when ToolApprovalRequest is approved, re-dispatch query with context
- [ ] 4.5 Handle rejection: update Query phase to `error` with rejection message

## 5. ToolApprovalRequest Controller

- [ ] 5.1 Create `ark/internal/controller/toolapprovalrequest_controller.go`:
  - Watch ToolApprovalRequest resources
  - Handle timeout expiration with optimistic locking
  - Check `status.phase == pending` before setting `expired`
  - Use server-side apply with field manager for conflict detection
  - Update Query phase when decision is made
- [ ] 5.2 Add controller to manager setup in `ark/cmd/manager/main.go`
- [ ] 5.3 Add RBAC markers for ToolApprovalRequest in controller file
- [ ] 5.4 Add unit tests for timeout handling and race conditions

## 6. Event Streaming — Approval Events

- [ ] 6.1 Define approval event types in `ark/executors/completions/streaming.go`:
  - `ToolApprovalRequestEvent` — emitted when approval is needed
  - `ToolApprovalDecisionEvent` — emitted when approval is granted/denied
- [ ] 6.2 Add `StreamApprovalRequest()` helper function to emit approval events with full tool context
- [ ] 6.3 Update broker event handling in `services/ark-broker/` to recognize new event types

## 7. API Service — Approval Endpoints with Authorization

- [ ] 7.1 Add `POST /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint:
  - Request body: `toolCallId` (or `toolCallIds` for batch), `action`, `reason`
  - Authorization checks:
    1. RBAC permission for ToolApprovalRequest update
    2. Match against `spec.approvers` list (role or user)
    3. Validate `reasonRequired` constraint
  - Optimistic locking: check generation before update
  - Return HTTP 403 for authorization failure
  - Return HTTP 409 for conflict (generation mismatch)
  - Return updated Query status on success
- [ ] 7.2 Add `GET /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint to list pending approvals
- [ ] 7.3 Add Pydantic models for approval request/response in `services/ark-api/ark-api/src/ark_api/models/`
- [ ] 7.4 Add API tests for approval endpoints including authorization scenarios

## 8. Dashboard — Approval UI

- [ ] 8.1 Add approval notification component to session view:
  - Display when query enters `approval-required` phase
  - Show all tool calls in batch with details:
    - Tool name and type
    - Arguments (formatted JSON)
    - Description
    - Annotations (destructiveHint badge, readOnlyHint badge)
    - Agent reasoning
  - Show timeout countdown
- [ ] 8.2 Add Approve/Reject buttons with reason input:
  - Reason field required if `reasonRequired: true`
  - Display validation error if reason missing when required
- [ ] 8.3 Wire approve/reject actions to API endpoint
- [ ] 8.4 Add pending approvals indicator to query list view
- [ ] 8.5 Handle real-time approval events from broker stream
- [ ] 8.6 Display approval decision confirmation with duration

## 9. A2A Protocol Extension

- [ ] 9.1 Add `tool-approval-required` to A2A task state enum in `ark/internal/a2a/a2a_types.go`
- [ ] 9.2 Add `PhaseToolApprovalRequired` to phase mapping in `ark/internal/a2a/a2a_protocol.go`
- [ ] 9.3 Update A2ATask CRD phase enum in `ark/api/v1alpha1/a2atask_types.go`
- [ ] 9.4 Define A2A approval message schemas:
  - `application/vnd.ark.tool-approval-request+json` for requests
  - Include `callbackUrl` for executor callback
- [ ] 9.5 Implement A2A approval callback handler in controller:
  - POST to `callbackUrl` with decision
  - Handle callback failures with retry
- [ ] 9.6 Document A2A approval protocol for custom executor developers
- [ ] 9.7 Add chainsaw e2e test for A2A approval flow

## 10. SDK Support

- [ ] 10.1 Add approval callback hook to `BaseExecutor` in `lib/ark-sdk/`:
  - `on_approval_required(tool_calls, timeout)` — called when executor needs approval
  - `wait_for_approval(callback_url)` — polls/waits for callback
- [ ] 10.2 Add approval types to SDK: `ToolApprovalRequest`, `ToolApprovalDecision`, `ToolCallInfo`
- [ ] 10.3 Document SDK approval integration in executor developer guide
- [ ] 10.4 Add example executor with HITL support

## 11. Samples & Documentation

- [ ] 11.1 Create `samples/agents/hitl-agent.yaml` — agent with approval-required tools
- [ ] 11.2 Create `samples/queries/hitl-query.yaml` — query demonstrating approval flow
- [ ] 11.3 Add HITL section to agent reference documentation
- [ ] 11.4 Add approval workflow guide to user documentation
- [ ] 11.5 Update samples README with HITL examples
- [ ] 11.6 Create migration guide for adding approval to existing agents
- [ ] 11.7 Document best practices: which tools should require approval in production vs development
- [ ] 11.8 Add examples of approval config for common tool types (database, email, deployment)

## 12. Testing

- [ ] 12.1 Add Go unit tests for approval policy evaluation in `ark/executors/completions/approval_test.go`
- [ ] 12.2 Add Go unit tests for context serialization/deserialization
- [ ] 12.3 Add Go unit tests for ToolApprovalRequest controller:
  - Timeout handling
  - Optimistic locking
  - Race condition scenarios
- [ ] 12.4 Add performance test: measure approval check overhead (should be O(1))
- [ ] 12.5 Create chainsaw e2e test: `tests/hitl/chainsaw-test.yaml`
  - Create agent with approval-required tool
  - Submit query that triggers tool call
  - Verify query enters `approval-required` phase
  - Verify ToolApprovalRequest created with full context
  - Submit approval via API
  - Verify query resumes and completes
- [ ] 12.6 Add chainsaw test for approval rejection flow
- [ ] 12.7 Add chainsaw test for approval timeout flow (both `reject` and `proceed`)
- [ ] 12.8 Add chainsaw test for batch approval (multiple tools)
- [ ] 12.9 Add chainsaw test for authorization failure (unauthorized approver)
- [ ] 12.10 Add admission failure tests for invalid approval config
- [ ] 12.11 Add concurrent approval tests:
  - Multiple simultaneous approval requests for same Query
  - Approval submission while Query is being canceled
  - Concurrent timeout expiration and approval submission
