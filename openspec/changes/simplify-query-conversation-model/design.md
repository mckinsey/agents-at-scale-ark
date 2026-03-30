## Context

The Query CRD currently supports two input modes: `type: "user"` (plain string) and `type: "messages"` (OpenAI message array). The `type: "messages"` path creates several architectural problems:

1. The query controller imports the completions executor package to parse OpenAI message format, coupling the dispatcher to a specific executor's internal types.
2. The A2A message carries only the extracted user text, but the executor re-fetches the Query CRD from Kubernetes to read the full message array — the A2A protocol is bypassed for the actual payload.
3. Two conversation continuity mechanisms coexist: client-side message accumulation (dashboard sends full history every time) and server-side memory (executor retrieves history via `conversationId`). These can diverge or duplicate.
4. Query CRDs grow unboundedly as conversations get longer, since the full message history is stored in `spec.input`.

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

### 3. Controller extracts user text directly from spec.input

With `type: "messages"` gone, the controller reads `spec.input` as a plain string (resolving ValueSource references as it already does for `type: "user"`). No message parsing needed, no completions package import.

The `extractUserInput()` function becomes a direct string read instead of calling `completions.GetQueryInputMessages()` + `completions.ExtractUserMessageContent()`.

The fallback `serializeMessages()` for wrapping response text in JSON is moved to a simple utility in the controller or a shared package — it doesn't need the completions message types.

### 4. Dashboard switches to conversationId-based continuity

The dashboard's `useChatSession` hook stops accumulating messages in `chatHistoryAtom`. Instead:
- On first message: sends user text + no conversationId. Receives conversationId in response.
- On subsequent messages: sends user text + conversationId from previous response.
- Message display: fetches conversation history from the API (backed by memory service) rather than local state.

This matches how the CLI already works with `--conversation-id`.

### 5. Deprecation and migration approach

Rather than removing `type: "messages"` in one step:
1. First, add a mutating webhook that converts `type: "messages"` queries: extracts last user message, stores messages in memory, rewrites to `type: "user"` with `conversationId`. Emits a migration warning annotation.
2. After one release cycle, remove `type: "messages"` support entirely.

This gives users of the CRD API time to migrate.

## Risks / Trade-offs

**Memory service becomes a hard dependency for conversations** → Currently, a client can have multi-turn conversations without a memory service by sending full history each time. After this change, multi-turn requires the memory service. Mitigation: the memory service is already required for CLI conversations and is a standard component in Ark deployments. Single-turn queries remain unaffected.

**Breaking change for direct Query CRD users** → Anyone applying `type: "messages"` queries via kubectl or custom controllers will break. Mitigation: mutating webhook provides automatic migration for one release cycle, and the OpenAI-compatible endpoint (most common path) handles translation transparently.

**Dashboard needs to fetch conversation history for display** → Currently the dashboard has all messages locally. After this change, it needs to query the memory service for history (e.g., on page load or reconnect). Mitigation: add a conversation history endpoint to the API if not already present, and fetch on mount.

**ark-api gains complexity** → The translation logic (store messages, extract last user text, create Query) adds responsibility to the API layer. Trade-off: this complexity was already spread across controller + executor and is now consolidated in the appropriate boundary layer.
