## Context

The Model CRD supports three providers (`openai`, `azure`, `bedrock`). Anthropic Claude is currently accessed via the `openai` provider with Anthropic's base URL or via AWS Bedrock. Neither approach expresses Anthropic connection settings natively, which limits custom executors that need to call the Anthropic Messages API directly.

The Bedrock provider already implements Anthropic message format conversion (request/response types, message conversion, tool mapping, response normalization to OpenAI format) but couples it to AWS SDK transport. This conversion logic can be shared.

## Goals / Non-Goals

**Goals:**
- Add `anthropic` as a first-class Model provider with native CRD config
- Custom executors can read Anthropic connection settings from the Model resource
- Agents using the default completions executor work with `provider: anthropic` out of the box
- Share Anthropic message format code between Bedrock and Anthropic providers
- Full parity with other providers: validation, health checks, API, Dashboard, CLI, docs

**Non-Goals:**
- Anthropic-specific features beyond basic Messages API (extended thinking, prompt caching, citations) — these can be added later via `properties`
- Native SSE streaming for the Anthropic provider — use the same single-chunk fallback as Bedrock initially
- Migrating existing `provider: openai` Anthropic models automatically — users migrate manually

## Decisions

### 1. CRD config shape: Mirror OpenAI + dedicated `version` field

`AnthropicModelConfig` will have: `baseUrl` (required), `apiKey` (required), `version` (optional, defaults to `2023-06-01`), `headers` (optional), `properties` (optional).

The `version` field follows the Azure `apiVersion` pattern — a dedicated field for a protocol-level parameter rather than burying it in headers. The Anthropic API requires the `anthropic-version` header on every request; making it explicit improves discoverability.

**Alternative considered:** Put version in `headers[]`. Rejected because it's a required protocol parameter, not an optional custom header.

### 2. Shared format module: Extract from Bedrock into `anthropic_format.go`

Rename `bedrock*` types to `anthropic*` types (`anthropicMessage`, `anthropicRequest`, `anthropicResponse`, `anthropicContent`, `anthropicTool`) and extract conversion functions into standalone functions in `anthropic_format.go`:

- `convertMessagesToAnthropic(messages []Message) ([]anthropicMessage, string)`
- `convertAnthropicResponse(response anthropicResponse) *openai.ChatCompletion`
- `convertToolsToAnthropic(tools []openai.ChatCompletionToolParam) []anthropicTool`
- `buildAnthropicRequest(messages []anthropicMessage, system string, tools []anthropicTool, properties map[string]string) anthropicRequest`
- `extractMessageContent(msg Message) (string, string)` — already package-level

`provider_bedrock.go` calls these shared functions instead of its own methods. `provider_anthropic.go` does the same with direct HTTP transport.

**Alternative considered:** Keep Bedrock types as-is and duplicate for Anthropic. Rejected because the types are identical (Bedrock's Claude models use Anthropic's native format).

### 3. Transport: Direct `net/http` with JSON marshal/unmarshal

The Anthropic provider uses `net/http` directly to POST to `{baseUrl}/messages`. Auth is `x-api-key` header. No new Go dependencies needed.

**Alternative considered:** Use the Anthropic Go SDK. Rejected to avoid a new dependency when the API surface is simple (single endpoint, straightforward JSON).

### 4. Streaming: Single-chunk fallback initially

Same approach as Bedrock — call the non-streaming endpoint and return the full response as a single chunk. Native SSE streaming can be added later.

### 5. Health check: Test completion

Follow the Azure pattern — send a minimal test message and check for a successful response. The Anthropic API doesn't have a models list endpoint, so we can't use the OpenAI-style list check.

## Risks / Trade-offs

- **Format extraction could break Bedrock** → Mitigate by running existing Bedrock tests after extraction. The refactor is mechanical (move + rename), no logic changes.
- **No native streaming** → Acceptable for initial implementation. The single-chunk fallback is proven (Bedrock uses it). Can add SSE streaming as a follow-up.
- **API version pinned to `2023-06-01`** → This is the current stable version. The `version` field allows users to override it. If Anthropic releases a new version, users can set it explicitly.

## Open Questions

None — all key decisions resolved during exploration.
