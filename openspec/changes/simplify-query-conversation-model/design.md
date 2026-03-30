## Context

The Query CRD currently supports two input modes: `type: "user"` (plain string) and `type: "messages"` (OpenAI message array). The `type: "messages"` path creates several architectural problems:

1. The query controller imports the completions executor package to parse OpenAI message format, coupling the dispatcher to a specific executor's internal types.
2. The CRD types file (`query_types.go`) directly imports `github.com/openai/openai-go`, coupling the API schema package to a provider SDK.
3. The A2A message carries only the extracted user text, but the executor re-fetches the Query CRD from Kubernetes to read the full message array — the A2A protocol is bypassed for the actual payload.
4. Two conversation continuity mechanisms coexist: client-side message accumulation (dashboard sends full history every time) and server-side memory (executor retrieves history via `conversationId`). These can diverge or duplicate.
5. Query CRDs grow unboundedly as conversations get longer, since the full message history is stored in `spec.input`.
6. The completions package has duplicate ConfigMap/Secret resolution helpers (`resolveConfigMapKeyRef` at `query_parameters.go:72`, `resolveSecretKeyRef` at `:85`) that are identical to existing shared helpers in `ark/internal/resolution/headers.go`.

The CLI already uses the `conversationId` + memory service path exclusively, proving it works. The dashboard's client-side accumulation was the initial implementation before the memory service existed.

## Goals / Non-Goals

**Goals:**
- Single conversation continuity mechanism: `conversationId` + memory service for all clients
- Query CRD always carries a single user input string, keeping resources small and uniform
- Controller has zero dependency on the completions executor package
- OpenAI API compatibility preserved — external clients see no change
- Dashboard and CLI use the same conversation model

**Non-Goals:**
- Changing the A2A protocol or message format between controller and executors
- Modifying the memory service API or storage model
- Supporting multimodal inputs (images) — not currently functional
- Changing how the completions executor internally calls LLM providers
- Modifying team orchestration strategies

## Decisions

### 1. ark-api becomes the OpenAI-to-Ark translation boundary

The `/openai/v1/chat/completions` endpoint currently passes `messages[]` straight through to the Query CRD. Instead, it will:
- Extract the last user message text from the incoming `messages[]`
- Store the full message history in the memory service under a `conversationId` (creating one if not provided)
- Create a `type: "user"` Query with the extracted text and the `conversationId`

**Alternative considered**: Having the completions executor handle this translation. Rejected because it would keep the executor as the only component that understands OpenAI message format, and the controller would still need to extract user text for the A2A message.

**Alternative considered**: Keeping `type: "messages"` but moving the parsing to a shared library. Rejected because it doesn't address the fundamental issue — the Query CRD shouldn't carry unbounded message arrays, and there should be one continuity mechanism.

### 2. Query CRD drops `type: "messages"`

The `Type` field and `QueryTypeMessages` constant are removed. `spec.input` is always a string (or ValueSource reference to a string). The `GetInputMessages()` and `SetInputMessages()` methods on the Query type are removed.

This is a breaking change for anyone creating Query CRDs with `type: "messages"` directly. Migration path: use `type: "user"` with a `conversationId` referencing messages stored in the memory service, or use the OpenAI-compatible endpoint which handles the translation.

### 3. Shared query input resolver in `ark/internal/resolution/`

The controller currently calls `completions.GetQueryInputMessages()` which handles two things: reading the input and resolving Go template parameters (`{{ .paramName }}`). With `type: "messages"` gone, we add `query_input.go` to the existing `ark/internal/resolution/` package (alongside `headers.go`) with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)`.

This function reads `spec.input` as a string, resolves ValueSource references, and applies Go template parameter expansion using existing `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret` helpers. The controller calls this instead of `completions.GetQueryInputMessages()` + `completions.ExtractUserMessageContent()`.

**Alternative considered**: Skipping parameter resolution in the controller and letting the executor handle it. Rejected because the controller sends the resolved text in the A2A message (`protocol.NewTextPart(userText)` at `query_controller.go:335`), and the resolved text is also used for telemetry/logging (first 48 chars shown in operation data). The executor would receive unresolved template strings.

### 4. Deduplicate ConfigMap/Secret resolution in completions

The completions package has its own `resolveConfigMapKeyRef` (`query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) that are identical to `resolution.ResolveFromConfigMap` (`headers.go:85`) and `resolution.ResolveFromSecret` (`:66`). Refactor completions' `resolveValueFrom` to delegate to the existing shared helpers, eliminating duplicate code and preventing drift.

### 5. Controller response fallback: `buildFallbackRaw`

The controller's response path has two branches (`query_controller.go:376-380`): if the executor returns `MessagesRaw` in A2A metadata under `QueryExtensionMetadataKey`, use it directly. Otherwise, fall back to `serializeMessages` which requires `completions.Message` types.

Replace `serializeMessages` with `buildFallbackRaw(responseText string) string` — a simple `json.Marshal` on an anonymous struct producing `[{"role":"assistant","content":"<text>"}]`. No completions types needed.

Additionally, ensure the completions handler's `buildA2AResponse` always populates `messages` metadata. Currently, `serializeResponseMessages` returns empty when `responseMessages` is empty or marshaling fails (`handler.go:545-569`). The fallback should be exceptional (non-completions executors), not routine.

### 6. Remove `openai-go` import from CRD types

Remove `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()` from the QuerySpec type. This eliminates the `github.com/openai/openai-go` import from `api/v1alpha1/query_types.go`, decoupling the CRD API schema from a specific provider SDK.

### 7. Dashboard switches to conversationId-based continuity

The dashboard's `useChatSession` hook stops accumulating messages in `chatHistoryAtom`. Instead:
- On first message: sends user text + no conversationId. Receives conversationId in response.
- On subsequent messages: sends user text + conversationId from previous response.
- Message display: fetches conversation history from the API (backed by memory service) rather than local state.

This matches how the CLI already works with `--conversation-id`.

### 8. Deprecation and migration approach

Rather than removing `type: "messages"` in one step:
1. First, add a mutating webhook that converts `type: "messages"` queries: extracts last user message, stores messages in memory, rewrites to `type: "user"` with `conversationId`. Emits a migration warning annotation.
2. After one release cycle, remove `type: "messages"` support entirely.

This gives users of the CRD API time to migrate.

## Risks / Trade-offs

**Memory service becomes a hard dependency for conversations** → Currently, a client can have multi-turn conversations without a memory service by sending full history each time. After this change, multi-turn requires the memory service. Mitigation: the memory service is already required for CLI conversations and is a standard component in Ark deployments. Single-turn queries remain unaffected.

**Breaking change for direct Query CRD users** → Anyone applying `type: "messages"` queries via kubectl or custom controllers will break. Mitigation: mutating webhook provides automatic migration for one release cycle, and the OpenAI-compatible endpoint (most common path) handles translation transparently.

**Dashboard needs to fetch conversation history for display** → Currently the dashboard has all messages locally. After this change, it needs to query the memory service for history (e.g., on page load or reconnect). Mitigation: add a conversation history endpoint to the API if not already present, and fetch on mount.

**ark-api gains complexity** → The translation logic (store messages, extract last user text, create Query) adds responsibility to the API layer. Trade-off: this complexity was already spread across controller + executor and is now consolidated in the appropriate boundary layer.

**Template parameter resolution divergence** → The new shared resolver in `ark/internal/resolution/` parses `json.RawMessage` directly instead of using OpenAI types. Edge cases in content format (string vs array-of-parts) could be missed. Mitigation: comprehensive unit tests covering all content formats, and the completions executor continues using its own `GetQueryInputMessages` internally for full message parsing.

## Mixed Deployment Compatibility

All scenarios below are safe because the A2A wire format is unchanged:

| Scenario | Result | Reason |
|----------|--------|--------|
| New controller + old completions executor | Works | Controller sends same A2A TextPart; executor ignores input type |
| New ark-api + old controller | Works | Old controller handles both `type: "user"` and `type: "messages"` |
| New dashboard + old ark-api | Works (degraded) | Old API doesn't store to memory; single-turn still works, multi-turn loses history on tab close |
| Old CLI `--conversation-id` + new controller | Works | `conversationId` field already supported |
| Named execution engine (Python SDK) | Works | SDK receives user text via A2A, never reads Query spec input format directly |
