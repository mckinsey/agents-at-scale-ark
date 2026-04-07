## Why

The Query CRD supports two input modes: `type: "user"` (single string) and `type: "messages"` (full OpenAI message array). The `type: "messages"` format creates tight coupling between the controller and the completions executor package, forces the controller to parse OpenAI message schemas it shouldn't care about, and enables two competing conversation continuity mechanisms (client-side accumulation vs server-side memory). The CRD types file (`query_types.go`) directly imports `github.com/openai/openai-go`, coupling the API schema package itself to a provider SDK.

The `/openai/v1/chat/completions` endpoint is the only API-level creator of `type: "messages"` queries and the only reason this format exists in the API layer. With this endpoint no longer needed, the entire `type: "messages"` path can be cleanly removed along with it.

## What Changes

- **BREAKING**: Remove `/openai/v1/chat/completions` and `/openai/v1/models` endpoints from ark-api.
- **BREAKING**: Remove `type: "messages"` from Query CRD. Queries always carry a single user input string with an optional `conversationId` for history retrieval.
- Migrate dashboard streaming from the OpenAI endpoint to the query API: create query via `POST /api/v1/queries/` with streaming annotation, then consume SSE via `GET /api/v1/broker/chunks?watch=true&query-id={name}` (ark-api broker proxy, not direct broker access).
- Migrate ark-cli from the OpenAI SDK wrapper (`arkApiClient.ts`) to the query API.
- Remove the controller's import of the completions executor package. The controller reads `spec.input` as a string, resolves template parameters via a shared resolver in `ark/internal/resolution/` (new `query_input.go` alongside existing `headers.go`), and passes the resolved text as an A2A TextPart.
- Deduplicate ConfigMap/Secret resolution: refactor completions' duplicate `resolveConfigMapKeyRef`/`resolveSecretKeyRef` (`query_parameters.go:72,85`) to delegate to existing `resolution.ResolveFromConfigMap`/`resolution.ResolveFromSecret` (`headers.go:66,85`).
- Ensure the completions handler reliably populates `messages` metadata in A2A responses under `QueryExtensionMetadataKey`, making the controller's fallback `buildFallbackRaw` exceptional rather than routine.
- Remove `openai-go` import from `api/v1alpha1/query_types.go` by removing `GetInputMessages()`, `SetInputMessages()`, and `GetInputAsGeneric()`.
- Update the dashboard to use `conversationId`-based continuity instead of client-side message accumulation. The dashboard sends only the current user message + `conversationId`, matching how the CLI already works.
- The completions executor retrieves conversation history exclusively from the memory service via `conversationId`, establishing a single continuity mechanism across all clients.

## Capabilities

### New Capabilities
- `query-input-simplification`: Remove OpenAI endpoints, drop `type: "messages"` from Query CRD, decouple controller from completions package, migrate dashboard and CLI to query API, shared query input resolver.

### Modified Capabilities
- `a2a-conversation-threading`: Requirements change — `conversationId` becomes the sole conversation continuity mechanism. The controller no longer parses or forwards message arrays.
- `a2a-query-extension`: The query extension metadata no longer carries message arrays from the controller. The executor retrieves messages from the memory service instead.

## Impact

- **ark-api OpenAI endpoints** (`services/ark-api/.../openai.py`): Remove `/openai/v1/chat/completions`, `/openai/v1/models`, `ChatCompletionRequest` model, streaming proxy, ReadOnlyMiddleware whitelist entry.
- **Query CRD** (`ark/api/v1alpha1/query_types.go`): Remove `QueryTypeMessages` constant, `openai-go` import, `GetInputMessages()`/`SetInputMessages()`/`GetInputAsGeneric()`, update validation and webhooks.
- **Query Controller** (`ark/internal/controller/query_controller.go`): Remove completions package import, rewrite `extractUserInput()` to use shared resolver in `ark/internal/resolution/`, replace `serializeMessages()` with `buildFallbackRaw`.
- **Shared Resolution** (`ark/internal/resolution/`): Add `query_input.go` with `ResolveQueryInputText` handling string input + Go template parameter expansion via existing `ResolveFromConfigMap`/`ResolveFromSecret` helpers.
- **Completions Executor** (`ark/executors/completions/`): `PrepareExecutionMessages()` changes — input is always a single user message, history always comes from memory. Deduplicate `resolveConfigMapKeyRef`/`resolveSecretKeyRef` to use shared `resolution` package. Ensure `buildA2AResponse` always populates `messages` metadata.
- **Dashboard** (`services/ark-dashboard/`): Migrate streaming from OpenAI endpoint to query API + broker proxy. Remove client-side message accumulation. Remove/rewrite `agents-api-dialog.tsx` and code snippets (Python/Go/Bash). Remove `ChatCompletionMessageParam` OpenAI type imports.
- **ark-cli** (`tools/ark-cli/`): Rewrite `arkApiClient.ts` to use query API instead of OpenAI SDK wrapper. Update `chatClient.ts`.
- **CI/CD** (`.github/workflows/cicd.yaml:482`): Update health check from `/openai/v1/models` to a different endpoint.
- **Docs**: Remove "OpenAI-Compatible APIs" sections from `ark-apis.mdx` and `queries.mdx`. Update streaming docs. Add migration guide for external OpenAI SDK users.
- **Tests**: Remove `test_openai.py`. Update dashboard streaming/dialog tests. Update middleware tests. Update `tests/query-input-type/` chainsaw tests.
- **Samples**: Remove or rewrite `query-conversation-messages.yaml`, remove broken `query-messages-image-url.yaml`.

## Compatibility Contract

- No A2A wire format changes — controller still sends `protocol.Message` with `TextPart` to executors.
- Named execution engines (Python SDK) are unaffected — they receive user text via A2A message, never read the Query spec's input format directly.
- **BREAKING for external OpenAI SDK users** — anyone using Ark with `base_url="/openai/v1"` via Python/JS/Go OpenAI SDK must migrate to the query API. Migration guide provided.
- Mixed internal deployments work: new controller + old completions executor (executor ignores input type), old CLI with `--conversation-id` + new controller (already supported).
- During deprecation period, mutating webhook converts `type: "messages"` queries from direct CRD users (kubectl) with migration warning.
- `response.raw` continues to contain OpenAI-compatible JSON for existing clients.
