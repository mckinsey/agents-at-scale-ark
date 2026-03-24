# Fix streaming timeout for named execution engines

## Problem

When the dashboard chat sends a query to an agent with a named execution engine (e.g., `executionEngine.name: executor-langchain`), the request times out even though the underlying query succeeds.

The dashboard defaults to `stream: true`. ark-api sets the `streaming-enabled` annotation on the Query CR and proxies to the broker's SSE streaming endpoint, waiting for chunks. But named execution engines bypass the completions engine entirely — the controller dispatches directly to the engine via blocking A2A. No chunks are ever written to the broker. The SSE proxy hangs until timeout.

This works for `executionEngine: a2a` agents because the controller routes those through the completions engine, which creates an `eventStream` to the broker and writes the result as a single chunk even when the A2A agent doesn't support streaming natively.

## Solution

Add a `streaming-supported` annotation on the ExecutionEngine CR. ark-api checks this annotation before deciding whether to proxy to the broker or fall back to polling.

### Flow

1. ark-api receives `stream: true` request targeting an agent
2. Fetches the Agent CR → finds `executionEngine.name` (not "a2a")
3. Fetches the ExecutionEngine CR → checks `ark.mckinsey.com/streaming-supported` annotation
4. If annotation is NOT `"true"` → polls via `watch_query_completion`, wraps result as single-chunk SSE response
5. If annotation IS `"true"` → normal streaming proxy to broker

### Annotation

```yaml
apiVersion: ark.mckinsey.com/v1prealpha1
kind: ExecutionEngine
metadata:
  name: executor-langchain
  annotations:
    ark.mckinsey.com/streaming-supported: "false"  # or omit entirely — default is no streaming
spec:
  address:
    value: "http://executor-langchain:8000"
```

Default behavior: no streaming support (annotation absent or `"false"`). Engines that write chunks to the broker can opt in with `"true"`.

## Changes

### ark-api (`services/ark-api/`)
- `src/ark_api/api/v1/openai.py` — After query creation, when `stream=true` and target is an agent: fetch agent, check for named engine, fetch ExecutionEngine CR, check annotation. Fall back to poll + single-chunk SSE if streaming not supported.
- `src/ark_api/constants/annotations.py` — Add `STREAMING_SUPPORTED_ANNOTATION` constant.

### Ark operator (`ark/`)
- `internal/annotations/annotations.go` — Add `StreamingSupported` constant (`ark.mckinsey.com/streaming-supported`).

### Documentation (`docs/`)
- `docs/content/developer-guide/building-execution-engines.mdx` — Document the `streaming-supported` annotation and when to set it.
- `docs/content/developer-guide/langchain-execution-engine.mdx` — Note that the langchain engine does not support streaming by default.

## Non-goals

- Dashboard-side changes (no frontend awareness of engine capabilities)
- Annotation propagation from ExecutionEngine to Agent (ark-api fetches both)
- Race-with-timeout or other speculative streaming approaches
