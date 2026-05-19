## 1. CRD Types & Schema

- [x] 1.1 Add `ToolApprovalConfig` struct to `ark/api/v1alpha1/agent_types.go` with fields:
  - `Required bool`
  - `Timeout *metav1.Duration`
  - `OnTimeout string` (enum: reject, proceed) with default "reject"
  - **Phase 2**: Approval-specific nested configs (e.g., `Approvers []string`, `ReasonRequired bool`)
- [x] 1.2 Add `Approval *ToolApprovalConfig` field to `AgentTool` struct in `ark/api/v1alpha1/agent_types.go`
- [x] 1.3 Add `input-required` to Query status phase enum in `ark/api/v1alpha1/query_types.go`
- [x] 1.4 Add kubebuilder validation markers:
  - `Timeout` must be positive duration
  - `OnTimeout` enum constraint (reject|proceed) with default "reject"
- [x] 1.5 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

**Note:** No new CRD needed! A2ATask already exists and supports this use case.

## 2. Validation & Webhooks

- [x] 2.1 Add `validateToolApprovalConfig` function to `ark/internal/validation/agent.go`:
  - Validate timeout format
  - Validate onTimeout enum
- [x] 2.2 Add admission tests for approval config validation to `ark/internal/webhook/v1/agent_webhook_test.go`

## 3. Completions Executor — Approval Check

- [x] 3.1 Create `ark/executors/completions/approval.go` with:
  - `ApprovalRequiredError` type with `ToolCalls`, `Config`, and `Context` fields
  - `ExecutionContext` struct with `ConversationID`, `PendingToolCallIndex`, `CompletedToolResults`, `AgentName`, `AgentNamespace`
  - `requiresApproval(toolName string) *ToolApprovalConfig` function (O(1) lookup)
  - `buildA2ATaskForApproval(query, toolCalls, config, context) *A2ATask` function (stubbed for now)
- [x] 3.2 Add `approvalRequiredTools map[string]*ToolApprovalConfig` field to `Agent` struct
- [x] 3.3 Populate `approvalRequiredTools` map in `MakeAgent()` for O(1) lookup
- [x] 3.4 Modify `executeToolCalls()` in `ark/executors/completions/agent.go`:
  - Check approval requirement before execution
  - Track completed tool results
  - Return `ApprovalRequiredError` with minimal execution context (NO conversation history serialization!)
- [x] 3.5 Add `ResumeFromApproval()` handler to:
  - Fetch conversation history from memory service using `contextId`
  - Apply `completedToolResults` from A2ATask parameters
  - Handle approval response (approved/rejected)
  - Continue execution from `pendingToolCallIndex`
- [x] 3.6 Create `ark/executors/completions/approval_test.go` with unit tests:
  - Approval policy evaluation
  - O(1) lookup performance
  - Resume with memory service integration
  - Response handling

## 4. Query Controller — Approval Phase Handling

- [x] 4.1 Add `PhaseInputRequired = "input-required"` constant to `ark/internal/controller/types.go`
- [x] 4.2 Modify executor handler to detect `ApprovalRequiredError`:
  - Create A2A Task with `state: input-required` and approval metadata
  - Return task in MessageProcessingResult
  - Emit streaming event for approval request
- [x] 4.3 Modify `sendQueryA2A` to detect Task responses:
  - Call `HandleA2ATaskResponse` to create A2ATask CRD
  - Return response with `phase: input-required`
- [x] 4.4 Add watch for A2ATask in query controller:
  - Added `Watches` with `findQueriesForA2ATask` mapping function
  - Maps A2ATask updates to associated Query via QueryRef
- [x] 4.5 Add `handleInputRequiredPhase` to query controller:
  - Checks A2ATask status when query is in input-required phase
  - Transitions to `done` when task completes
  - Transitions to `error` when task fails/cancelled

## 5. A2ATask Controller — Timeout Handling

- [x] 5.1 Extend `ark/internal/controller/a2atask_controller.go` to handle approval timeouts:
  - Added `checkApprovalTimeout()` function to check and handle timeouts
  - Reads timeout from `status.ProtocolMetadata["timeout"]`
  - Checks `status.phase == "input-required"` before applying timeout action
  - Respects `onTimeout` policy: "reject" → `failed`, "proceed" → `completed`
  - Calculates timeout based on `status.StartTime`
  - Updates phase and condition when timeout expires
- [ ] 5.2 Add unit tests for timeout handling and race conditions (deferred - functional tests needed)

## 6. Event Streaming — Approval Events

- [x] 6.1 Define approval event types in `ark/executors/completions/streaming.go`:
  - `ToolApprovalRequestEvent` — emitted when approval is needed
  - `ToolApprovalResponseEvent` — emitted when user responds
- [x] 6.2 Add `StreamApprovalRequest()` helper function to emit approval events with full tool context
- [x] 6.3 Update broker event handling in `services/ark-broker/` to recognize new event types

## 7. API Service — Approval Endpoints with RBAC

- [x] 7.1 Add `POST /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint:
  - Request body: `action` (approved/rejected), `toolCallId` (or `toolCallIds`)
  - Authorization: RBAC check for A2ATask update permission
  - Optimistic locking: check phase == `input-required` before update
  - Return HTTP 403 for authorization failure
  - Return HTTP 409 for conflict (phase mismatch)
  - Return updated Query status on success
- [x] 7.2 Add `GET /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint to get pending approval details
- [x] 7.3 Add Pydantic models for approval request/response in `services/ark-api/ark-api/src/ark_api/models/`
  - `ApprovalRequest` with action field
  - `ApprovalResponse` model
- [ ] 7.4 Add API tests for approval endpoints including authorization scenarios

## 8. Dashboard — Approval UI

- [x] 8.1 Add approval notification component to session view:
  - Display when query enters `input-required` phase
  - Show all tool calls in batch with details:
    - Tool name and type
    - Arguments (formatted JSON)
    - Timeout and onTimeout policy
    - Agent name
  - Component created: `components/sessions-conversations/approval-notification.tsx`
- [x] 8.2 Add Approve/Reject buttons (included in approval-notification component)
- [x] 8.3 Wire approval responses to API endpoint:
  - Created service: `lib/services/query-approvals.ts`
  - Created hooks: `lib/services/query-approvals-hooks.ts`
  - Added `useGetQuery` hook to `lib/services/queries-hooks.ts`
  - **Integrated into MessageDisplay component:**
    - Detects query phase via `useGetQuery` hook
    - Fetches approval details when phase is `input-required`
    - Renders `ApprovalNotification` in message stream
    - Handles approve/reject actions via `useSubmitApproval` mutation
- [ ] 8.4 Add pending approvals indicator to query list view (future enhancement)
- [ ] 8.5 Handle real-time approval events from broker stream (future enhancement)
- [x] 8.6 Display approval decision confirmation with duration (implemented in component)
- [x] 8.7 **BUG FIX**: Handle approval detection when no conversation messages exist in broker:
  - **Issue**: MessageDisplay gets query ID from last message, but when no messages are stored in broker, `latestQueryId` is null, so approval UI never appears
  - **Root cause**: Completions executor doesn't emit conversation messages to broker for approval flows
  - **Chosen approach**: Make dashboard poll for pending approval queries when processing
  - **Implementation**:
    - Modified `message-display.tsx` to call `useListQueries` when `isProcessing && !latestQueryId`
    - Filter queries client-side to find most recent query for this session with `phase: input-required`
    - Use `effectiveQueryId = latestQueryId || pendingApprovalQuery?.name`
    - Added `enabled` parameter to `useListQueries` hook to only fetch when needed
  - **Files changed**:
    - `components/sessions-conversations/message-display.tsx`
    - `lib/services/queries-hooks.ts`

**Dashboard Integration Complete:**
The approval notification now appears automatically in session conversations when a query enters `input-required` phase, even when no prior messages exist in the broker. The dashboard polls for pending approval queries during processing and displays the approval UI as soon as the query transitions to `input-required`.

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

- [x] 11.1 Create `samples/agents/hitl-agent.yaml` — agent with approval-required tools
- [x] 11.2 Create `samples/queries/hitl-query.yaml` — query demonstrating approval flow
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

**Note:** Sample agent includes three tool examples:
- `deploy-application` - requires approval, 5m timeout, reject on timeout
- `delete-database` - requires approval, 10m timeout, reject on timeout
- `get-deployment-status` - read-only, no approval required

Sample query demonstrates triggering an approval-required tool call.

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
