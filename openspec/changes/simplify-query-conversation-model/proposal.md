## Why

The Query CRD supports two input modes: `type: "user"` (single string) and `type: "messages"` (full OpenAI message array). The `type: "messages"` format creates tight coupling between the controller and the completions executor package, forces the controller to parse OpenAI message schemas it shouldn't care about, and enables two competing conversation continuity mechanisms (client-side accumulation vs server-side memory). This makes the architecture harder to reason about and maintain.

## What Changes

- **BREAKING**: Remove `type: "messages"` from Query CRD. Queries always carry a single user input string with an optional `conversationId` for history retrieval.
- Move the OpenAI `messages[]` → single user input translation into the ark-api completion endpoint, which becomes the boundary where OpenAI format is converted to Ark's native format. The endpoint stores the incoming message history in the memory service before creating the Query.
- Remove the controller's import of the completions executor package. The controller passes `spec.input` as an A2A TextPart directly, with no message parsing.
- Update the dashboard to use `conversationId`-based continuity instead of client-side message accumulation. The dashboard sends only the current user message + `conversationId`, matching how the CLI already works.
- The completions executor retrieves conversation history exclusively from the memory service via `conversationId`, establishing a single continuity mechanism across all clients.

## Capabilities

### New Capabilities
- `api-conversation-translation`: The ark-api OpenAI completion endpoint translates incoming `messages[]` into memory service storage + a simple `type: "user"` Query with `conversationId`.

### Modified Capabilities
- `a2a-conversation-threading`: Requirements change — `conversationId` becomes the sole conversation continuity mechanism. The controller no longer parses or forwards message arrays.
- `a2a-query-extension`: The query extension metadata no longer carries message arrays from the controller. The executor retrieves messages from the memory service instead.

## Impact

- **Query CRD** (`ark/api/v1alpha1/query_types.go`): Remove `QueryTypeMessages` constant, remove message array input handling from spec, update validation and webhooks.
- **Query Controller** (`ark/internal/controller/query_controller.go`): Remove completions package import, simplify `extractUserInput()` to read string directly, remove `serializeMessages()`.
- **Completions Executor** (`ark/executors/completions/`): `PrepareExecutionMessages()` changes — input is always a single user message, history always comes from memory. Remove dual-source merging logic.
- **ark-api** (`services/ark-api/`): OpenAI completion endpoint becomes the translation layer — stores messages in memory, creates simplified Query.
- **Dashboard** (`services/ark-dashboard/`): Remove client-side message accumulation in `chatHistoryAtom`, switch `useChatSession` to send single messages with `conversationId`.
- **Docs**: Update query reference, user guide (structured conversations), developer guide (a2a-queries, building execution engines).
- **Tests**: `tests/query-input-type/` chainsaw tests, query validation tests, OpenAI endpoint tests, dashboard chat tests, completions handler/message helper tests.
- **Samples**: Remove or rewrite `query-conversation-messages.yaml`, remove broken `query-messages-image-url.yaml`.
