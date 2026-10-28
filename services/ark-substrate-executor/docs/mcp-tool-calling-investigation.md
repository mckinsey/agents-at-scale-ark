# Investigation: ark-runner not invoking MCP tool calls

## Symptom
Agent `substrate-agent` (15 file-gateway MCP tools) asked to write a file. The query returns a
*description* of the tool call as text, e.g. the model's content was literally:

```
{"tool":"write_file","path":"london.txt","content":"hello london"}
```

No `tools/call` reaches the MCP server; no file is written (file-gateway root only has the file
written by a direct test). So the tool loop never fires.

## What we've already proven
- The MCP path itself works: running ark-runner's own `mcp_client` directly (port-forward) does
  `tools/list` (15 tools) + `write_file` + `read_text_file` successfully. Paths are relative to
  the file-gateway allowed root `/data/aas-files`.
- In the actor, MCP `initialize` succeeds (server logs "Session initialized"), so discovery
  connects through Substrate egress.

## The claim to validate
Ark's **completions** ExecutionEngine (Go, `ark/executors/completions/`) drives MCP tool calls
across all models, including gpt-5-nano. So the model is not the blocker — ark-runner's
completions adapter must differ. The fix: make ark-runner do what the completions executor does.

## Findings
(appended as we go)

### Finding 1 — model + model_client are fine; tools weren't reaching the model
Ran the adapter's exact model call against the real gateway model with the 15 tools:
`complete(gpt-5-nano, msgs, tools=<15>)` → returned **structured** `tool_calls`:
`[{function:{name:"write_file", arguments:{path:"london.txt",content:"hello london"}}}]`
with empty content. So gpt-5-nano DOES do function-calling when tools are passed.

The agent's `{"tool":"write_file",...}` **text** is the no-tools fallback — i.e. in the actor
run the model was called WITHOUT tools. Root cause is upstream of the model call: either the
request reaching ark-runner had no `mcpServers`, or `_discover_tools()` returned empty in the
actor (MCP unreachable through egress). Next: determine which.

### Finding 2 — the request reaching ark-runner has mcpServers=0
Instrumented the adapter; a live agent query logged `__ARK_DIAG__ mcpServers=0 discovered_tools=0`
and `model_tool_calls=0`. The full adapter loop works locally end-to-end (discovers 15 tools,
model emits tool_call, write_file executes, file created). So the adapter is correct; the
`ExecutionEngineRequest` arrives at ark-runner with NO mcpServers. The loss is on the executor
side — ark-sdk's `ExecutorApp` builds the request (via extensions/query `_build_mcp_servers`
fetching the agent's Tool CRDs → MCPServers) using the EXECUTOR's k8s client/RBAC. Next: why
`_build_mcp_servers` yields nothing for the substrate executor.

### Finding 3 — ROOT CAUSE + FIX (resolved)
Two compounding bugs:

1. **ark-sdk's Python address resolver had no `serviceRef` branch.** `_resolve_value_source`
   (lib/ark-sdk/.../extensions/query.py) handled only `value`, `secretKeyRef`, `configMapKeyRef`.
   The MCPServer's address is a `serviceRef` (named port `web`, path `/mcp`), so it resolved to
   `""` → "MCPServer 'file-gateway' has no resolvable address" → the server was dropped →
   `mcpServers=0` in the request → model got no tools → it emitted the tool call as **text**
   (the `{"tool":...}` blob) instead of a structured `tool_call`. The Go completions executor
   resolves `serviceRef` (common.ResolveServiceReference), which is why it works there.
   **Fix:** added `_resolve_service_ref` to ark-sdk, mirroring the Go logic
   (`http://<name>.<ns>.svc.cluster.local:<port><path>`, resolving named service ports).

2. **The executor image installed ark-sdk 0.1.72 from PyPI, not the local fixed wheel.**
   `pip install --find-links <dir> ark-sdk` (no `--no-index`) let the published PyPI 0.1.72
   shadow the local same-version wheel, so the fix never shipped. **Fix:** install the local
   wheel BY PATH (`pip install "$(ls .../ark_sdk-*.whl | sort -V | tail -1)"`).

**Verified end-to-end through the agent (not a direct test):**
`__ARK_DIAG__ mcpServers=1 discovered_tools=15` → `calling tool write_file` →
`calling tool read_text_file` → answer. Independent check: `mcp-proof.txt` exists in
file-gateway containing "mcp tool calls work". Works with gpt-5-nano (the model was never the
problem — tools just weren't reaching it).

Note: file paths are relative to file-gateway's allowed root `/data/aas-files`.

## Teams + HITL validation (2026-10-27)

### Teams of multiple substrate agents — WORKS (after deploying ark-completions)
Team queries dispatch to the `ark-completions` executor (team orchestration lives there). It
was not deployed, so team queries failed with `Post "http://ark-completions.ark-system/": no
such host`. Deployed `ark/executors/completions/chart` (ghcr image 0.1.72). Then a sequential
team of two substrate agents completed: completions logged `executing agent on execution engine
agent=sub-a engine=substrate` and `...agent=sub-b engine=substrate`, responseCount=2. So Ark
orchestrates the team and delegates each member to the substrate engine via A2A — no substrate
change needed; it was a missing component.

### HITL (per-tool approval) — BROKEN for substrate agents (silent bypass)
A substrate agent with `tools: [{type: mcp, name: file-gateway-write-file, approval:{required:true}}]`
asked to write a file: the query went running→done and the file was written with NO approval
step, no "awaiting approval" state. The approval requirement was silently ignored.
Root cause: (1) ark-sdk does not carry per-tool `approval` into the ExecutionEngineRequest, so
ark-runner never learns the tool needs approval; (2) ark-runner has no approval flow anyway. The
completions executor enforces approval itself (approval.go + agent resumption + broker). Fix
scope TBD below.

#### HITL protocol (why the fix is large) + options
Ark's HITL is a cross-request **pause/resume** protocol, not an in-loop check:
1. The executor hits an approval-required tool → raises `ApprovalRequiredError` carrying an
   `ExecutionContext` (pending tool-call index, already-completed tool results).
2. It emits a streaming approval-request event to the broker AND the A2A task/query enters an
   awaiting state (it RETURNS from the request — it does not block).
3. A human approves/rejects via the dashboard → sets the **A2ATask** phase (Completed=approved,
   Failed=rejected).
4. A resumption request re-enters the executor (`checkResumptionForState`) which calls
   `ResumeFromApproval` to run approved tools / inject rejection and continue.

For substrate this needs: (a) ark-sdk to propagate per-tool `approval` into the request (today
`AgentConfig`/`mcpServers` drop it); (b) ark-runner to STOP at an approval-required tool and
surface the pending context instead of executing; (c) the substrate executor to pause the query
and participate in the A2A-task resumption; (d) resuming the actor mid-loop with the decision.
This overlaps the deferred Phase-3 resumption work and is a sizeable feature.

**Immediate safe fix (no silent bypass):** propagate `approval.required` to ark-runner and have
it REFUSE (deny) approval-required tool calls rather than auto-executing them — fail-safe until
full HITL lands. **Full fix:** implement the A2A-task approval/resumption protocol above.

---

## HITL — FULL implementation (DONE, verified e2e 2026-10-27)

The full A2A-task approval/resumption protocol is implemented for the substrate path. No Go
controller changes were needed — `sendQueryA2A` already turns an executor-returned
`input-required` A2A Task into a HITL `A2ATask` (the `input-required` rejection in `a2a.go` is
only on the external-A2AServer path). The entire feature lives in **shared ark-sdk** +
ark-runner + the substrate executor, so every ark-sdk-based executor gets HITL, not just
substrate.

### What changed (4 components)
1. **ark-sdk types + request** (`executor.py`, `extensions/query.py`): added
   `ToolApprovalConfig`, `ArgumentMatch`, `ToolApproval`, `ExecutionContext`, `ResumeContext`,
   `ApprovalRequiredError`; `MCPServerConfig.approvals` and `ExecutionEngineRequest.resume`.
   `_build_mcp_servers` now resolves the merged Tool-CRD + agent-tool approval (mirrors Go
   `mergeApprovalConfig`) onto the owning server. `fetch_resumption(query_ref)` reads the
   Query's `status.response.a2a.taskId` → the terminal HITL `A2ATask` →
   `status.protocolMetadata.{toolCalls,context}` into a `ResumeContext`.
2. **ark-sdk ExecutorApp** (`executor_app.py`, `broker.py`): before executing (non-sub-target)
   it calls `fetch_resumption` and sets `request.resume`. On `ApprovalRequiredError` it emits a
   `tool_approval_request` broker event, closes the stream with NO final chunk, and enqueues an
   A2A **`Task`** object (id=context.task_id, state=input-required, string-valued metadata
   `{toolCalls,timeout,onTimeout,context}`). Sub-target + approval → explicit error.
   `broker.send_event` posts a raw NDJSON event (not an OpenAI chunk).
3. **ark-runner** (`adapters.py`, `__main__.py`): builds an approvals map from
   `mcpServers[].approvals`; the forward loop pauses the whole turn (Go parity) raising
   `ApprovalRequiredError` with the pending calls + `ExecutionContext(messages=...)` when any
   call is gated (`_matches_approval_arguments` ports the Go regex-on-raw-arg-value +
   no-matchers=gate-all semantics); the resume path rebuilds `[history, assistant(toolCalls),
   results]` applying the decision (approved→invoke, rejected→inject reason) then continues the
   loop (so a further gated call pauses again). `__main__` emits a distinct result sentinel
   `{"status":"approval_required",...}`.
4. **ark-substrate-executor** (`executor.py`): `_parse_result_logs` raises
   `ApprovalRequiredError` on the approval sentinel; `execute_agent` re-raises it BEFORE the
   generic `except` (so the query is NOT marked error). Resume delivery needs no change —
   `request.resume` is already serialized into `ARK_AGENT_REQUEST`, so a fresh ephemeral actor
   receives it. The ephemeral-actor model is fine because the pending state rides in the
   A2ATask, not a live process (no dependency on the flaky gVisor snapshot/resume).

### Required cluster change
The executor ServiceAccount needs **`get`/`list`/`watch` on `a2atasks`** (added to its
ClusterRole in `deploy/minikube-executor.yaml`). Without it `fetch_resumption` 403s, returns
None, and the resume silently restarts the turn → re-gates identically (observed as an
apparent infinite cascade). This was the one non-obvious deployment gotcha.

### Dockerfiles
Both the executor and runner Dockerfiles install the local ark-sdk wheel **by path**
(`pip install "$(ls /tmp/ark-sdk-dist/ark_sdk-*.whl | sort -V | tail -1)"`), so the published
same-version PyPI wheel can't shadow the overlay changes.

### a2a-sdk gotcha (cost a rebuild)
The first attempt returned the input-required status via `TaskUpdater.update_status(...)`,
which the a2a-sdk v2 blocking handler rejects: *"Agent should enqueue Task before
TaskStatusUpdateEvent event"*. The fix is to enqueue a `Task` proto directly as the first
event (exactly what the Go executor returns). A plain `dict[str,str]` assigns cleanly to the
Task's protobuf `metadata` Struct and the string values survive the round-trip.

### Verification (live minikube, substrate agent `hitl-sub`, gated `file-gateway-write-file`)
- **Approve**: query→input-required; HITL `A2ATask` created (`a2aServerRef` empty,
  `protocolMetadata.{toolCalls,timeout=5m,onTimeout=reject,context}` populated); approve →
  resumed → file written with the exact content → done. ✓
- **Reject**: tool never ran; the rejection message is injected into the tool result; the
  model then retried `write_file` → a new A2ATask (cascade). This is faithful parity with the
  Go executor's `handleResumption` (reject → model re-calls gated tool → re-gated). ✓
- **Timeout** (`timeout: 30s`, agent `hitl-sub-timeout`): with no human action the controller
  flipped the A2ATask to `failed` after 30s ("Approval timeout exceeded after 30s"); the
  resume injected that exact timeout reason as the tool result and honored `onTimeout=reject`
  (no file). ✓
- **Cascading**: a resumed run whose next tool is also gated produces a second A2ATask
  (observed in both reject and timeout runs). ✓
- **No regression**: plain substrate query ("Paris is the capital of France."), team of 2
  substrate agents (sequential, both members ran), and a **non-gated** MCP tool
  (`read-text-file`, approval=false) all ran to `done`; the non-gated tool executed inline
  with no approval pause. ✓

### Known behavior (not a bug)
On reject/timeout the model may keep re-calling the gated tool, pausing on each attempt. This
matches the Go completions executor exactly (same reconstruct-and-continue loop). A human must
keep rejecting, or the agent prompt must tell the model to stop on denial.
