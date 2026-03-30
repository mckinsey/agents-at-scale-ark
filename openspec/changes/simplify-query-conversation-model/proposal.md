## Why

The Query CRD supports two input modes: `type: "user"` (single string) and `type: "messages"` (full OpenAI message array). The `type: "messages"` format creates tight coupling between the controller and the completions executor package, forces the controller to parse OpenAI message schemas it shouldn't care about, and enables two competing conversation continuity mechanisms (client-side accumulation vs server-side memory). The CRD types file (`query_types.go`) directly imports `github.com/openai/openai-go`, coupling the API schema package itself to a provider SDK. This makes the architecture harder to reason about and maintain.

## What Changes

- **BREAKING**: Remove `type: "messages"` from Query CRD. Queries always carry a single user input string with an optional `conversationId` for history retrieval.
- Move the OpenAI `messages[]` → single user input translation into the ark-api completion endpoint, which becomes the boundary where OpenAI format is converted to Ark's native format. The endpoint stores the incoming message history in the memory service before creating the Query.
- Remove the controller's import of the completions executor package. The controller reads `spec.input` as a string, resolves template parameters via a shared resolver in `ark/internal/resolution/` (new `query_input.go` alongside existing `headers.go`), and passes the resolved text as an A2A TextPart.
- Deduplicate ConfigMap/Secret resolution: the completions package has duplicate `resolveConfigMapKeyRef`/`resolveSecretKeyRef` implementations (`query_parameters.go:72,85`) that are identical to existing `resolution.ResolveFromConfigMap`/`resolution.ResolveFromSecret` (`headers.go:66,85`). Refactor completions to delegate to the existing shared helpers.
- Ensure the completions handler reliably populates `messages` metadata in A2A responses under `QueryExtensionMetadataKey`, making the controller's fallback `buildFallbackRaw` exceptional rather than routine.
- Remove `openai-go` import from `api/v1alpha1/query_types.go` by removing `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()`.
- Update the dashboard to use `conversationId`-based continuity instead of client-side message accumulation. The dashboard sends only the current user message + `conversationId`, matching how the CLI already works.
- The completions executor retrieves conversation history exclusively from the memory service via `conversationId`, establishing a single continuity mechanism across all clients.

## Capabilities

### New Capabilities
- `api-conversation-translation`: The ark-api OpenAI completion endpoint translates incoming `messages[]` into memory service storage + a simple `type: "user"` Query with `conversationId`.

### Modified Capabilities
- `a2a-conversation-threading`: Requirements change — `conversationId` becomes the sole conversation continuity mechanism. The controller no longer parses or forwards message arrays.
- `a2a-query-extension`: The query extension metadata no longer carries message arrays from the controller. The executor retrieves messages from the memory service instead.

## Impact

- **Query CRD** (`ark/api/v1alpha1/query_types.go`): Remove `QueryTypeMessages` constant, remove `openai-go` import, remove `GetInputMessages()`/`SetInputMessages()`/`GetInputAsGeneric()`, update validation and webhooks.
- **Query Controller** (`ark/internal/controller/query_controller.go`): Remove completions package import, rewrite `extractUserInput()` to use shared resolver in `ark/internal/resolution/`, replace `serializeMessages()` with `buildFallbackRaw`.
- **Shared Resolution** (`ark/internal/resolution/`): Add `query_input.go` with `ResolveQueryInputText` handling string input + Go template parameter expansion via existing `ResolveFromConfigMap`/`ResolveFromSecret` helpers.
- **Completions Executor** (`ark/executors/completions/`): `PrepareExecutionMessages()` changes — input is always a single user message, history always comes from memory. Deduplicate `resolveConfigMapKeyRef`/`resolveSecretKeyRef` to use shared `resolution` package. Ensure `buildA2AResponse` always populates `messages` metadata.
- **ark-api** (`services/ark-api/`): OpenAI completion endpoint becomes the translation layer — stores messages in memory, creates simplified Query.
- **Dashboard** (`services/ark-dashboard/`): Remove client-side message accumulation in `chatHistoryAtom`, switch `useChatSession` to send single messages with `conversationId`.
- **Docs**: Update query reference, user guide (structured conversations), developer guide (a2a-queries, building execution engines).
- **Tests**: `tests/query-input-type/` chainsaw tests, query validation tests, OpenAI endpoint tests, dashboard chat tests, completions handler/message helper tests.
- **Samples**: Remove or rewrite `query-conversation-messages.yaml`, remove broken `query-messages-image-url.yaml`.

## Compatibility Contract

- No A2A wire format changes — controller still sends `protocol.Message` with `TextPart` to executors.
- Named execution engines (Python SDK) are unaffected — they receive user text via A2A message, never read the Query spec's input format directly.
- Mixed deployments work: new controller + old completions executor (executor ignores input type), new ark-api + old controller (old controller handles both types), old CLI with `--conversation-id` + new controller (already supported).
- During deprecation period, mutating webhook converts `type: "messages"` queries automatically with migration warning.
- `response.raw` continues to contain OpenAI-compatible JSON for existing clients.
