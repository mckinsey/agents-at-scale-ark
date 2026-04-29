## Context

The built-in completions engine (Go) already streams OpenAI-format `chat.completion.chunk` events to the ark-broker during execution. External execution engines built on the Python ark-sdk do not — they return a full response via A2A, which the controller writes to `Query.status.response`, but the broker never sees it. The dashboard and CLI both depend on broker chunks to display responses in real time.

The controller is intentionally decoupled from the broker. The fix belongs in `ExecutorApp` (`executor_app.py`), which is the A2A server wrapper that all external executors use. It already discovers K8s resources (it reads `ark-config-streaming` ConfigMap via `streaming_config.py`) and owns the full execution lifecycle for external engines.

## Goals / Non-Goals

**Goals:**
- Dashboard and CLI work for all external executors after Phase 1, with no executor code changes
- Executors can opt in to real-time token streaming in Phase 2 by calling `self.stream_chunk()`
- Broker errors never fail a query
- Controller stays completely broker-agnostic

**Non-Goals:**
- Streaming support in the completions engine (already done)
- Changes to A2A protocol or chunk format
- Per-executor broker configuration (single global `ark-config-streaming` ConfigMap)

## Decisions

### Decision: Fix in `ExecutorApp`, not the controller

The controller dispatches queries and writes `Query.status.response` — it has no business knowing about the broker. `ExecutorApp` already owns the A2A server lifecycle and has access to K8s for config resolution. All external executors use it, so the fix is universal.

**Alternative considered**: Controller sends synthetic chunk after receiving A2A response. Rejected — couples the controller to the broker, breaks clean architecture.

### Decision: Phase 1 sends a single chunk after `execute_agent()` returns

The simplest path to unblocking the UI. `ExecutorApp` calls `execute_agent()`, gets the full response, then POSTs one `chat.completion.chunk` with `finish_reason: "stop"` to the broker. No executor changes needed.

**Alternative considered**: Skip Phase 1 entirely and only ship Phase 2. Rejected — Phase 2 requires per-executor work; Phase 1 unblocks all engines immediately.

### Decision: Phase 2 uses `stream_chunk()` injected on `BaseExecutor`

Executors call `await self.stream_chunk(token)` inside `execute_agent()`. `ExecutorApp` injects a live `BrokerClient` before calling `execute_agent()` when the broker is configured. This keeps the executor interface simple (single method, same return type) and makes streaming opt-in without breaking existing executors.

`stream_chunk()` sets a boolean flag `_streamed` on the executor instance. After `execute_agent()` returns, `ExecutorApp` checks `_streamed` to decide whether to skip the single-chunk fallback. Thread safety is not a concern — asyncio executors run in a single event loop thread, so `_streamed` is never accessed concurrently.

**Alternative considered**: Separate `stream_agent()` async generator method. Rejected — requires executors to restructure their execution loop into a generator, and introduces two methods that both need to be kept in sync.

### Decision: OpenAI `chat.completion.chunk` format

Dashboard, CLI, and broker already speak this format. The completions engine already produces it. No new parsers needed anywhere.

### Decision: `broker.py` as a standalone module

Broker discovery and HTTP logic is self-contained in a new `broker.py`. `executor_app.py` imports from it. Keeps concerns separate and makes the broker client independently testable.

## Risks / Trade-offs

- **Phase 1 UX**: Single chunk at the end means no incremental streaming — the user still waits for the full response before seeing anything. Mitigation: Phase 2 addresses this; Phase 1 is an explicit stepping stone.
- **Broker discovery latency**: `discover_broker_url()` does a K8s API call on every execution. Mitigation: result can be cached per-process since the ConfigMap changes rarely.
- **Chunk lost on broker error**: If the broker POST fails, the response is still in `Query.status.response` but the UI won't show it via streaming. Mitigation: errors are logged; UI can fall back to polling the Query CR.

## Open Questions

- Should `discover_broker_url()` cache its result in-process? (Likely yes — defer to implementation.)
- Phase 2: if an executor calls `stream_chunk()` and also returns messages from `execute_agent()`, should `ExecutorApp` skip the final single-chunk fallback? (Yes — if any `stream_chunk()` calls were made, `complete()` is sufficient.)
