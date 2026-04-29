## 1. CRD Types & Schema

- [ ] 1.1 Add `ToolApprovalConfig` struct to `ark/api/v1alpha1/agent_types.go` with fields: `Required bool`, `Timeout *metav1.Duration`, `OnTimeout string` (enum: reject, proceed)
- [ ] 1.2 Add `Approval *ToolApprovalConfig` field to `AgentTool` struct in `ark/api/v1alpha1/agent_types.go`
- [ ] 1.3 Add `approval-required` to Query status phase enum in `ark/api/v1alpha1/query_types.go`
- [ ] 1.4 Create `ark/api/v1alpha1/toolapprovalrequest_types.go` with `ToolApprovalRequest` CRD:
  - Spec: `QueryRef`, `ToolCall` (id, name, type, arguments), `Timeout`, `OnTimeout`
  - Status: `Phase` (pending, approved, rejected, expired), `Decision` (action, decidedBy, decidedAt, reason)
- [ ] 1.5 Add `ToolApprovalRequest` to scheme registration in `ark/api/v1alpha1/groupversion_info.go`
- [ ] 1.6 Run `make manifests` in `ark/` to regenerate CRDs and sync Helm chart

## 2. Validation & Webhooks

- [ ] 2.1 Add `validateToolApprovalConfig` function to `ark/internal/validation/agent.go` — validate timeout format, onTimeout enum
- [ ] 2.2 Add validation webhook for ToolApprovalRequest in `ark/internal/webhook/v1/` — validate phase transitions, required fields
- [ ] 2.3 Add admission tests for approval config validation to `ark/internal/webhook/v1/agent_webhook_test.go`

## 3. Completions Executor — Approval Check

- [ ] 3.1 Create `ark/executors/completions/approval.go` with:
  - `ApprovalRequiredError` type
  - `requiresApproval(agentTool AgentTool, toolCall ToolCall) bool` function
  - `buildApprovalRequest(query, toolCall, config) *ToolApprovalRequest` function
- [ ] 3.2 Modify `executeToolCalls()` in `ark/executors/completions/agent.go` to check approval requirement before execution
- [ ] 3.3 Add approval config to `Agent` struct and `MakeAgent()` function to pass through tool approval settings
- [ ] 3.4 Create `ark/executors/completions/approval_test.go` with unit tests for approval policy evaluation

## 4. Query Controller — Approval Phase Handling

- [ ] 4.1 Add `PhaseApprovalRequired = "approval-required"` constant to `ark/internal/controller/query_controller.go`
- [ ] 4.2 Modify query reconciliation to handle `ApprovalRequiredError` from executor:
  - Create ToolApprovalRequest CRD
  - Set Query phase to `approval-required`
  - Emit streaming event
- [ ] 4.3 Add watch for ToolApprovalRequest in query controller setup
- [ ] 4.4 Implement resume logic: when ToolApprovalRequest is approved, re-dispatch query with approval context

## 5. ToolApprovalRequest Controller

- [ ] 5.1 Create `ark/internal/controller/toolapprovalrequest_controller.go`:
  - Watch ToolApprovalRequest resources
  - Handle timeout expiration (set phase to `expired`, update Query)
  - Cleanup on Query deletion (owner reference handles this)
- [ ] 5.2 Add controller to manager setup in `ark/cmd/manager/main.go`
- [ ] 5.3 Add RBAC markers for ToolApprovalRequest in controller file

## 6. Event Streaming — Approval Events

- [ ] 6.1 Define approval event types in `ark/executors/completions/streaming.go`:
  - `ToolApprovalRequestEvent` — emitted when approval is needed
  - `ToolApprovalDecisionEvent` — emitted when approval is granted/denied
- [ ] 6.2 Add `StreamApprovalRequest()` helper function to emit approval events
- [ ] 6.3 Update broker event handling in `services/ark-broker/` to recognize new event types

## 7. API Service — Approval Endpoints

- [ ] 7.1 Add `POST /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint to `services/ark-api/`:
  - Request body: `toolCallId`, `action` (approve/reject), `reason` (optional)
  - Validates query is in `approval-required` phase
  - Updates ToolApprovalRequest status
  - Returns updated Query status
- [ ] 7.2 Add `GET /api/v1/namespaces/{namespace}/queries/{name}/approval` endpoint to list pending approvals
- [ ] 7.3 Add Pydantic models for approval request/response in `services/ark-api/ark-api/src/ark_api/models/`
- [ ] 7.4 Add API tests for approval endpoints

## 8. Dashboard — Approval UI

- [ ] 8.1 Add approval notification component to session view in `services/ark-dashboard/`:
  - Display when query enters `approval-required` phase
  - Show tool call name, type, arguments
  - Show timeout countdown
- [ ] 8.2 Add Approve/Reject buttons with optional reason input
- [ ] 8.3 Wire approve/reject actions to API endpoint
- [ ] 8.4 Add pending approvals indicator to query list view
- [ ] 8.5 Handle real-time approval events from broker stream

## 9. A2A Protocol Extension

- [ ] 9.1 Add `tool-approval-required` to A2A task state enum in `ark/internal/a2a/a2a_types.go`
- [ ] 9.2 Add `PhaseToolApprovalRequired` to phase mapping in `ark/internal/a2a/a2a_protocol.go`
- [ ] 9.3 Update A2ATask CRD phase enum in `ark/api/v1alpha1/a2atask_types.go`
- [ ] 9.4 Document A2A approval protocol for custom executor developers

## 10. SDK Support

- [ ] 10.1 Add approval callback hook to `BaseExecutor` in `lib/ark-sdk/`:
  - `on_approval_required(tool_call, timeout)` — called when executor needs approval
  - `wait_for_approval(tool_call_id)` — blocks until approval received
- [ ] 10.2 Add approval types to SDK: `ToolApprovalRequest`, `ToolApprovalDecision`
- [ ] 10.3 Document SDK approval integration in executor developer guide

## 11. Samples & Documentation

- [ ] 11.1 Create `samples/agents/hitl-agent.yaml` — agent with approval-required tools
- [ ] 11.2 Create `samples/queries/hitl-query.yaml` — query demonstrating approval flow
- [ ] 11.3 Add HITL section to agent reference documentation
- [ ] 11.4 Add approval workflow guide to user documentation
- [ ] 11.5 Update samples README with HITL examples

## 12. Testing

- [ ] 12.1 Add Go unit tests for approval policy evaluation in `ark/executors/completions/approval_test.go`
- [ ] 12.2 Add Go unit tests for ToolApprovalRequest controller
- [ ] 12.3 Create chainsaw e2e test: `tests/hitl/chainsaw-test.yaml`
  - Create agent with approval-required tool
  - Submit query that triggers tool call
  - Verify query enters `approval-required` phase
  - Verify ToolApprovalRequest created
  - Submit approval via API
  - Verify query resumes and completes
- [ ] 12.4 Add chainsaw test for approval rejection flow
- [ ] 12.5 Add chainsaw test for approval timeout flow
- [ ] 12.6 Add admission failure tests for invalid approval config
