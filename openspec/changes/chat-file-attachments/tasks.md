# Implementation Tasks

Sequenced so each numbered group is a self-contained commit that passes lint and tests on its own. The model-facing groups (1-2) land first so attachments actually reach a model before the UI can send them; ark-api (3) and the dashboard (4) build on that; the SDK contract (5) unblocks the marketplace executors, tracked separately in group 7.

## 1. Query input contract and controller tolerance (Go, `ark/`)

- [ ] 1.1 Add a multimodal-aware input accessor to `ark/api/v1alpha1/query_types.go` that reports string vs. content-part-array input; keep `GetInputString` string-only. Confirm no CRD schema change is needed (`spec.input` already schemaless).
- [ ] 1.2 Make `ark/internal/resolution/query_input.go` `ExtractFirstUserText` / `ResolveQueryInputText` non-fatal when a user message has no text part (image-only), skipping `image_url`/`file` parts.
- [ ] 1.3 Harden `ark/internal/validation/defaults.go` `DefaultQuery` so defaulting/naming tolerate non-text content; document the `type: messages` -> string migration as text-only (lossy for media).
- [ ] 1.4 Unit (Go): image-only first user message -> empty text, no error; defaulting/naming succeed on multimodal input; confirm no webhook rejects it.

## 2. Completions executor multimodal (Go, `ark/executors/completions/`)

- [ ] 2.1 `query_parameters.go` `GetQueryInputMessages`: detect string vs. content-part array; build a multi-part user message for arrays; add a `NewMultiPartUserMessage` constructor in `types.go`. No hard failure on array input.
- [ ] 2.2 Apply template/parameter resolution to text parts only; never mutate base64 payloads.
- [ ] 2.3 `anthropic_format.go`: add image/document block types and convert `image_url`/`file` parts into Anthropic `image`/`document` blocks (base64 and URL); stop dropping messages with no string content; preserve cache-control on a valid block.
- [ ] 2.4 Thread a base64-only constraint for Bedrock through `provider_anthropic.go` / `model_bedrock.go` (reject or pre-fetch URL sources); OpenAI/Azure providers pass parts through unchanged (verify, no code change expected).
- [ ] 2.5 `message_helpers.go`: make `ExtractUserMessageContent` (telemetry) tolerate multi-part content by joining text parts.
- [ ] 2.6 Unit (Go): array input -> multi-part message; Anthropic image + PDF block conversion (base64 and URL); Bedrock URL rejection/pre-fetch; telemetry text extraction on multi-part.

## 3. ark-api multimodal input and gateway bridge (Python, `services/ark-api/`)

- [ ] 3.1 Fix list-content serialization in `models/queries.py` so message `content` arrays are materialized, not dropped to `[]`; add MIME allowlist (`image/png|jpeg|gif|webp`, `application/pdf`) and per-attachment + total decoded-size caps.
- [ ] 3.2 Add a request-size guard (middleware or per-endpoint) sized for base64 payloads under the K8s object ceiling.
- [ ] 3.3 In `api/v1/queries.py`, pass materialized multimodal input into the Query spec; confirm `_extract_*_text` helpers tolerate non-text parts (add coverage).
- [ ] 3.4 Add a file-gateway attachment endpoint: given a `{service, path}` gateway reference, fetch bytes in-cluster via the proxy addressing, enforce MIME allowlist + size cap, return a base64 `image_url` (image) or `file` (PDF) content part; authenticate the caller to ark-api and reach the gateway under the service identity (do not forward the caller's bearer token).
- [ ] 3.5 Unit (Python): valid multimodal create round-trips content parts; disallowed MIME and oversized attachment rejected; request-size guard; search helpers tolerate non-text parts; gateway endpoint returns the right part and enforces MIME/size and in-cluster auth.

## 4. Dashboard chat attachments (TypeScript, `services/ark-dashboard/`)

- [ ] 4.1 Add `lib/utils/chat-attachments.ts`: MIME allowlist + `accept` string, size/count constants, `ChatAttachment` type, `File`->data-URL, `toContentParts(text, attachments)`, and `validateAttachment`.
- [ ] 4.2 `chat-input.tsx`: add the attach-file button + hidden picker (images + PDF), attachment chips with remove (image thumbnail / PDF chip), client-side validation with error toasts, and allow attachment-only send.
- [ ] 4.3 Add a file-gateway picker dialog reusing the existing files browser (extract a shared browse component from `files-section.tsx` if it reduces drift); on pick, fetch bytes (or call the ark-api gateway endpoint) and append a `ChatAttachment`.
- [ ] 4.4 `chat.ts` / `conversations.ts` (+ hooks types): when attachments exist, send `type: "messages"` with one user message built from `toContentParts`; keep the plain-string path unchanged otherwise.
- [ ] 4.5 Render attachments in the user turn: extend `session-pending-messages.ts`, `conversations-tab.tsx`, `message-display.tsx`, `session-message.tsx`, and widen `chat-message.ts` `content`; add a text projection so pending/persisted dedupe still matches on attachment turns.
- [ ] 4.6 Unit (TS): validation (type/size/count), `toContentParts` shape (image_url + file), gateway pick, attachment rendering (pending + persisted) and dedupe on a text projection.

## 5. Ark SDK executor contract (Python, `lib/ark-sdk/`)

- [ ] 5.1 Widen `ark_sdk/executor.py` `Message.content` to `Union[str, list[dict]]`, keeping string as the first member and `Config.extra = "allow"` (backward-compatible).
- [ ] 5.2 `extensions/query.py` `resolve_query` / `_resolve_from_query`: build `userInput.content` from the structured `spec.input` of the fetched Query when it carries parts; fall back to string.
- [ ] 5.3 `executor_app.py`: make response-text extraction list-safe (`_content_to_text` helper for `_do_execute` and broker chunk paths); advertise image/file input modes on the agent card.
- [ ] 5.4 Unit (Python): string content unchanged; list content preserved; multimodal `userInput.content` built from a Query with image parts; list-safe response extraction; agent card input modes.

## 6. ark-broker body limit (Node.js, `services/ark-broker/`)

- [ ] 6.1 Raise/parameterize the JSON body-size limit (`src/server.ts`) via the broker config module so base64 payloads are not rejected before handling; document the new limit.
- [ ] 6.2 Unit/integration: a message with a base64 image within the limit is stored and read back with parts intact.

## 7. Downstream marketplace executors (separate repo - tracked, not in this change)

- [ ] 7.1 Cut a new `ark-sdk` release carrying the widened `Message` contract.
- [ ] 7.2 openai-responses: bump the `ark-sdk` pin; add a Chat-Completions -> Responses content-part translator (`image_url` -> `input_image` string url; `file` -> `input_file` file_data/file_id/file_url); wire through `_build_user_message` / `first_turn` / continuation.
- [ ] 7.3 langchain: bump the pin; pass multimodal `HumanMessage` content; extract text-only on the RAG path.
- [ ] 7.4 claude-agent-sdk: spike the Agent SDK `query()` multimodal contract; bump the pin; forward content blocks.

## 8. End-to-end verification

- [ ] 8.1 Chainsaw e2e: chat with an image and with a PDF against a mock model; assert the content part reaches the executor request.
- [ ] 8.2 Run lint + tests in every touched stack (Go, Python, TypeScript, Node.js) - clean before push.
