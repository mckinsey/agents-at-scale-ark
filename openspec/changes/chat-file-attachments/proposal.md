## Why

Chatting with an Ark agent is text-only today. A user cannot hand an agent a screenshot, a scanned form, or a PDF - the exact artifacts most real questions are about. The whole path enforces text: the dashboard chat input sends a plain string, and the completions executor collapses `Query.spec.input` to a single `NewUserMessage(string)` before it ever reaches the model. Any structured (multi-part) input hard-fails at execution today (`GetQueryInputMessages` errors on a non-string input), and ark-api silently drops list-valued message content on serialization, so even the shapes that look supported do not round-trip.

The gap is not the storage layer - `Query.spec.input` is already a schemaless `runtime.RawExtension`, the broker stores messages as opaque JSON, and the OpenAI Go/Python message unions already model image and file content parts. The gap is that every read path flattens to text and the send path never produces anything but text.

This change adds file attachments (images and PDFs) to agent chat, end to end: an "attach file" button and a "pick from the file gateway" flow in the dashboard, a validated multimodal query-input contract through ark-api and the controller, correct forwarding to the model in the completions executor (including the Anthropic/Bedrock conversion that drops images today), and a widened Ark SDK `Message` contract so downstream marketplace executors can receive files too.

## What Changes

The wire format is an OpenAI Chat-Completions-style messages array carried in `Query.spec.input` with `type: messages`. A user turn's `content` is an array mixing a text part with `image_url` parts (base64 `data:` URI or URL) and `file` parts (base64 `file_data` + `filename`) for PDFs. Attachments travel embedded in `spec.input`; forwarding attachments to external/third-party A2A agents as A2A `FilePart`s is explicitly deferred (see Non-goals).

### Dashboard chat attachments

- Add an "attach file" button to the chat input (`chat-input.tsx`) with a hidden file picker restricted to images and PDF, selected-file chips with remove, and client-side validation (MIME allowlist, per-file and total size caps, max count). Allow sending an attachment-only message (no text).
- Add a "pick from the file gateway" flow that reuses the existing file-gateway browse UI (`files-client.ts`, the browser subset of `files-section.tsx`) to attach a file already stored in the gateway.
- Build a multimodal query input in `chat.ts` / `conversations.ts`: convert attachments to OpenAI content parts and send `type: "messages"` with a single user message carrying the parts (the generated `QueryCreateRequest.input` union already accepts this), instead of the plain-string path.
- Render attachments in the user's chat turn (image thumbnails, PDF chips) for both optimistic (pending) and persisted messages, and make the pending/persisted dedupe match on a text projection so attachment turns still dedupe.

### ark-api multimodal input and file-gateway bridge

- Accept and validate multimodal query input: MIME allowlist (`image/png|jpeg|gif|webp`, `application/pdf`), per-attachment and total decoded-size caps, and a request-size guard. Fix the list-content serialization bug so message `content` arrays are materialized rather than silently dropped to `[]`.
- Keep the search/text-extraction helpers tolerant of non-text parts (they already skip `image_url`/`file` parts; this is preserved and covered by tests).
- Add a server-side endpoint that, given a file-gateway file reference, fetches the bytes in-cluster via the existing proxy path, enforces the MIME allowlist and size cap, and returns a ready-to-send OpenAI content part (base64) - so the browser never round-trips raw bytes and MIME/size are enforced server-side.

### Query input contract and completions executor

- Confirm no CRD schema change is needed (`spec.input` is already schemaless) and no admission webhook rejects multimodal input; make the defaulting/text-extraction paths (`ExtractFirstUserText`, `DefaultQuery`) tolerate a message whose content is entirely non-text (image-only) without erroring.
- Make the completions executor build multi-part messages from structured input instead of hard-failing: `GetQueryInputMessages` detects string vs. content-part array and constructs a multi-part user message; template/parameter resolution applies to text parts only (never to base64 payloads).
- OpenAI and Azure providers pass content parts through unchanged. The Anthropic converter (`anthropic_format.go`), which today reads only string content and drops images, converts `image_url`/`file` parts into Anthropic `image`/`document` blocks; Bedrock inherits this but is base64-only (URL sources rejected or pre-fetched). Telemetry/content-extraction helpers tolerate multi-part content.

### Ark SDK executor contract

- Widen `ark_sdk.executor.Message.content` from `str` to `Union[str, list[dict]]`, backward-compatible (string remains the first union member; `Config.extra = "allow"` is kept), so downstream executors receive files.
- Have the SDK build multimodal `userInput.content` from the structured `Query.spec.input` it already fetches (`resolve_query` / `_resolve_from_query`) rather than from the flattened A2A text; make response-text extraction list-safe and advertise image/file input modes on the agent card.
- Raise/parameterize the ark-broker JSON body limit (currently 10 MB) so base64 payloads are not rejected before any handler runs; persistence itself already round-trips opaque JSON.

## Impact

- **ark-dashboard (TypeScript):** New `lib/utils/chat-attachments.ts` (validation constants, `File`->data-URL, content-part builder) and a file-gateway picker dialog reusing the existing files browser; modified `chat-input.tsx`, `chat.ts`, `conversations.ts` (+ hooks types), `session-pending-messages.ts`, `conversations-tab.tsx`, `message-display.tsx`, `session-message.tsx`, and `chat-message.ts` (widen `content`). No generated-type change (`QueryCreateRequest.input` already accepts the union).
- **ark-api (Python):** Request-model fix to materialize list content and validate MIME/size; a request-size guard; a new file-gateway attachment endpoint reusing the proxy's in-cluster addressing and impersonation. `queries.py` create path and the search helpers.
- **ark controller (Go):** No CRD schema change. Tolerance fixes in `resolution/query_input.go` and `validation/defaults.go` so image-only content does not error defaulting/naming/search.
- **completions executor (Go):** New multi-part input construction (`query_parameters.go`, `types.go`), Anthropic/Bedrock content-block conversion (`anthropic_format.go`, `provider_anthropic.go`, `model_bedrock.go`), and multi-part-tolerant telemetry helpers. OpenAI/Azure providers unchanged.
- **lib/ark-sdk (Python):** Widen `Message.content`; read structured input in `extensions/query.py`; list-safe response text and updated input modes in `executor_app.py`. Overlay-only - no codegen/CRD regeneration.
- **ark-broker (Node.js):** Configurable JSON body-size limit for base64 payloads; no schema change.
- **Size ceiling:** attachments are base64-inlined into the Query CR, bounded by the Kubernetes API-server object limit (~1.5 MB). The size caps and request guard above keep payloads under that ceiling.
- **Tests:** Unit (TS) for attachment validation, content-part building, gateway pick, and attachment rendering/dedupe; unit (Python) for multimodal input validation/materialization, the search-helper tolerance, and the gateway attachment endpoint (MIME allowlist, size cap, in-cluster auth); Go unit for multi-part input construction and Anthropic/Bedrock block conversion (base64 and URL, image and PDF); chainsaw e2e for an image and a PDF chat against a mock model.

## Dependencies

Downstream executor engines live in the separate marketplace repo (`github.com/mckinsey/agents-at-scale-marketplace`) and are updated there once this change ships a widened `ark-sdk` release; they are referenced, not specified here:

- **openai-responses executor** - the OpenAI Responses API uses a different content-part shape than Chat Completions (`input_image` with a string `image_url`; `input_file` with `file_id`/`file_data`/`file_url`). Needs a Chat->Responses translator plus an `ark-sdk` pin bump.
- **langchain executor** - `HumanMessage.content` already accepts multi-part content; needs the pin bump and text-only extraction on the RAG path.
- **claude-agent-sdk executor** - the Agent SDK's `query()` multimodal input contract needs a spike; pin bump.

## Non-goals

- Forwarding attachments to external/third-party A2A agents as A2A `FilePart`s (the plumbing exists in the Go A2A layer but is unused on the query-dispatch path). Attachments travel embedded in `spec.input`; A2A `FilePart` forwarding is a later, separable change.
- Audio (`input_audio`) content.
- Streaming media output (completion chunks remain text; images are delivered via the memory/messages path).
- Preserving multimodal content through the deprecated `type: messages` -> string migration in the defaulting webhook (that path stays text-only and is documented as lossy for media).
