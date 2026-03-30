## Context

The Query CRD currently supports two input modes: `type: "user"` (plain string) and `type: "messages"` (OpenAI message array). The `/openai/v1/chat/completions` endpoint is the only API-level consumer that creates `type: "messages"` queries. With this endpoint no longer needed, the entire `type: "messages"` path can be removed cleanly.

Current architectural problems:
1. The query controller imports the completions executor package to parse OpenAI message format, coupling the dispatcher to a specific executor's internal types.
2. The CRD types file (`query_types.go`) directly imports `github.com/openai/openai-go`, coupling the API schema package to a provider SDK.
3. The A2A message carries only the extracted user text, but the executor re-fetches the Query CRD from Kubernetes to read the full message array — the A2A protocol is bypassed for the actual payload.
4. Two conversation continuity mechanisms coexist: client-side message accumulation (dashboard sends full history every time) and server-side memory (executor retrieves history via `conversationId`). These can diverge or duplicate.
5. Query CRDs grow unboundedly as conversations get longer, since the full message history is stored in `spec.input`.
6. The completions package has duplicate ConfigMap/Secret resolution helpers (`resolveConfigMapKeyRef` at `query_parameters.go:72`, `resolveSecretKeyRef` at `:85`) that are identical to existing shared helpers in `ark/internal/resolution/headers.go`.

The CLI already uses the `conversationId` + memory service path exclusively, proving it works. The dashboard's client-side accumulation was the initial implementation before the memory service existed.

## Goals / Non-Goals

**Goals:**
- Remove the OpenAI-compatible endpoints from ark-api
- Single conversation continuity mechanism: `conversationId` + memory service for all clients
- Query CRD always carries a single user input string, keeping resources small and uniform
- Controller has zero dependency on the completions executor package
- Dashboard and CLI use the query API for all operations

**Non-Goals:**
- Changing the A2A protocol or message format between controller and executors
- Modifying the memory service API or storage model
- Supporting multimodal inputs (images) — not currently functional
- Changing how the completions executor internally calls LLM providers
- Modifying team orchestration strategies

## Decisions

### 1. Remove OpenAI endpoints from ark-api

The `/openai/v1/chat/completions` and `/openai/v1/models` endpoints are removed. The endpoint was the only API-level creator of `type: "messages"` queries. Removing it eliminates the need for the translation layer we previously designed.

Remove: `openai.py` route handler, `ChatCompletionRequest` model, streaming proxy function (`proxy_streaming_response`), `/openai/v1/chat/completions` entry in ReadOnlyMiddleware.

The `/openai/v1/models` endpoint listed agents/teams/models/tools in OpenAI format. This is already available via the existing resource list endpoints (`/api/v1/agents/`, `/api/v1/models/`, etc.).

### 2. Dashboard streaming via query API + broker proxy

The dashboard currently streams via the OpenAI endpoint. The replacement is a two-step pattern:
1. `POST /api/v1/queries/` — create query with streaming annotation (`ark.mckinsey.com/streaming-enabled: "true"`)
2. `GET /api/v1/broker/chunks?watch=true&query-id={queryName}` — consume SSE via the existing ark-api broker proxy

The broker proxy already exists at `/api/v1/broker/chunks` (`broker.py:205-232`). It constructs the broker URL internally (`{broker_url}/stream/{query_id}?from-beginning=true`) and proxies SSE back to the client. The dashboard never calls the broker directly.

**Alternative considered**: Adding a streaming endpoint to the queries API (`POST /api/v1/queries/{name}/stream`). Rejected because the broker proxy already exists and works. Adding a new endpoint would duplicate functionality.

### 3. CLI migration from OpenAI SDK to query API

ark-cli currently wraps the OpenAI SDK pointing at `/openai/v1` (`arkApiClient.ts:53`). Replace with direct calls to the query API (`/api/v1/queries/`). For streaming, use the same broker proxy pattern as the dashboard.

fark (Go CLI) is unaffected — it already creates Query CRDs directly via the Kubernetes API.

### 4. Query CRD drops `type: "messages"`

The `Type` field and `QueryTypeMessages` constant are removed. `spec.input` is always a string (or ValueSource reference to a string). The `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` methods are removed, along with the `github.com/openai/openai-go` import.

Since the only API-level creator of `type: "messages"` queries (the OpenAI endpoint) is removed simultaneously, the only remaining users are direct CRD creators (kubectl). A mutating webhook provides migration during the deprecation period.

### 5. Shared query input resolver in `ark/internal/resolution/`

The controller currently calls `completions.GetQueryInputMessages()` which handles reading input and resolving Go template parameters (`{{ .paramName }}`). Add `query_input.go` to the existing `ark/internal/resolution/` package (alongside `headers.go`) with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)`.

This function reads `spec.input` as a string, resolves ValueSource references, and applies Go template parameter expansion using existing `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret` helpers. The controller calls this instead of `completions.GetQueryInputMessages()` + `completions.ExtractUserMessageContent()`.

**Alternative considered**: Skipping parameter resolution in the controller and letting the executor handle it. Rejected because the controller sends the resolved text in the A2A message (`protocol.NewTextPart(userText)` at `query_controller.go:335`), and the resolved text is also used for telemetry/logging.

### 6. Deduplicate ConfigMap/Secret resolution in completions

The completions package has its own `resolveConfigMapKeyRef` (`query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) that are identical to `resolution.ResolveFromConfigMap` (`headers.go:85`) and `resolution.ResolveFromSecret` (`:66`). Refactor completions' `resolveValueFrom` to delegate to the existing shared helpers.

### 7. Controller response fallback: `buildFallbackRaw`

Replace `serializeMessages` with `buildFallbackRaw(responseText string) string` — a simple `json.Marshal` on an anonymous struct producing `[{"role":"assistant","content":"<text>"}]`. No completions types needed.

Ensure the completions handler's `buildA2AResponse` always populates `messages` metadata so the fallback is exceptional (non-completions executors only).

### 8. Remove `openai-go` import from CRD types

Remove `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` from the QuerySpec type. This eliminates the `github.com/openai/openai-go` import from `api/v1alpha1/query_types.go`.

### 9. Dashboard switches to conversationId-based continuity

The dashboard's `useChatSession` hook stops accumulating messages in `chatHistoryAtom`. Instead:
- On first message: sends user text + no conversationId. Receives conversationId in response.
- On subsequent messages: sends user text + conversationId from previous response.
- Message display: fetches conversation history from the API (backed by memory service) rather than local state.

### 10. Deprecation and migration approach

For `type: "messages"` direct CRD users: mutating webhook converts during deprecation period, then removal after one release cycle.

For external OpenAI SDK users: migration guide documenting how to switch from `base_url="/openai/v1"` with OpenAI SDK to the native query API. Published before the endpoint is removed.

## Risks / Trade-offs

**Breaking change for external OpenAI SDK users** → Anyone integrating with Ark via Python/JS/Go OpenAI SDK loses compatibility. This was a documented, promoted feature with code snippets in the dashboard UI. Mitigation: migration guide, deprecation notice, and the query API already provides equivalent functionality.

**Memory service becomes a hard dependency for conversations** → After this change, multi-turn requires the memory service. Mitigation: already required for CLI conversations and is a standard component in Ark deployments. Single-turn queries remain unaffected.

**Dashboard streaming becomes two-step** → Currently one call (OpenAI endpoint handles creation + streaming). After: create query, then stream. Mitigation: cleaner separation of concerns, and the broker proxy already exists.

**Template parameter resolution divergence** → The new shared resolver parses `json.RawMessage` directly instead of using OpenAI types. Mitigation: comprehensive unit tests covering all content formats.

## Mixed Deployment Compatibility

| Scenario | Result | Reason |
|----------|--------|--------|
| New controller + old completions executor | Works | Controller sends same A2A TextPart; executor ignores input type |
| Old CLI `--conversation-id` + new controller | Works | `conversationId` field already supported |
| Named execution engine (Python SDK) | Works | SDK receives user text via A2A, never reads Query spec input format |
| External OpenAI SDK user + new ark-api | **Breaks** | Endpoint removed; must migrate to query API |
| New dashboard + old ark-api | Works (degraded) | Old API still has both endpoints; new dashboard uses query API which also exists in old API |
