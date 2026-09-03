## Context

`MCPExecutor.Execute` builds the tool message by walking the MCP content parts: text parts are appended, and every other part is `json.MarshalIndent`-ed into the same string. An `ImageContent` part therefore reaches the model as a JSON object with a base64 `data` field inside the tool message text. The model cannot see it, and a page-sized PNG costs tens of thousands of tokens to say nothing.

The two places that need to change are the MCP boundary, where the bytes are currently lost, and the Anthropic request encoder, which only knows how to write a message whose content is a string.

## Goals / Non-Goals

**Goals**
- An agent can answer a question about an image an MCP tool returned.
- Text-only requests keep their existing wire format.
- Image ingress is bounded, so a large or repeated image cannot fail the request or exhaust the context window.

**Non-Goals**
- Images from non-MCP tools (HTTP, built-in). They return no image content today.
- Images through the human-in-the-loop approval resume path in `handler.go`, which rebuilds a `ToolResult` from the tool message text.
- Audio or other non-text modalities.
- Image resizing or re-encoding. An image is carried as returned or not at all.

## Decisions

**Images ride on `ToolResult`, not in its `Content`.**
`ToolResult` gains `Images []ToolResultImage` holding the media type and raw bytes. `Content` keeps a one-line note (`[image returned: image/png, 20481 bytes]`) so the transcript still records that something came back. Alternative — encoding the image into `Content` in a form the encoder later parses out — makes the tool text a wire format and breaks the moment a tool legitimately returns that text.

**The image becomes a user message, not part of the tool message.**
The OpenAI schema allows only text parts in the `tool` role, so a tool message cannot carry an image in either the OpenAI or the Anthropic API. `NewUserImageMessage` builds a user message with one `ImageContentPart` per image plus a caption naming the tool, appended immediately after the tool message. This shape is native OpenAI, so the OpenAI and Azure providers need no change at all; only the Anthropic encoder has to learn it.

**Images travel between the two points as an OpenAI data URL.**
`NewUserImageMessage` writes `data:<media type>;base64,<data>`, and `imageFromDataURL` reads it back when converting to Anthropic. This keeps the in-memory message a plain OpenAI message — so memory, streaming, and the OpenAI providers keep working untouched — at the cost of one base64 round-trip. Alternative — a parallel image field on the internal `Message` type — would fork `Message` away from `openai.ChatCompletionMessageParamUnion` and touch every consumer.

**`anthropicMessage.Content` becomes `json.RawMessage`.**
This was already true before this change: prompt caching renders the breakpoint message as a block array. The change extends the block type with an optional `source` so one block type covers text, cached text, and images, and folds the two rendering paths into `renderAnthropicContent(text, images, cached)`. A text-only, uncached message still marshals to a bare JSON string, so the request bytes are unchanged.

**A non-base64 image URL is dropped, not passed on.**
The Anthropic base64 image source cannot carry a remote URL. Emitting the URL as text would put a link in the prompt that the model would either hallucinate about or try to browse. Dropping it is the honest failure.

**Three limits, enforced at two points.**
`ARK_TOOL_IMAGE_MAX_BYTES` (5 MiB) and `ARK_TOOL_IMAGE_MAX_PER_TOOL_CALL` (4) are enforced in `collectContent`, where the decoded bytes first arrive. `ARK_TOOL_IMAGE_MAX_BYTES_PER_TURN` (15 MiB) is a cumulative budget held across every tool call in one turn, enforced in `executeToolCalls` where the loop already sits. The per-image default is set against the binding provider constraint — Anthropic accepts roughly 5 MB per image, OpenAI roughly 20 MB — and file-gateway, the tool that motivated this feature, caps its own uploads at 1 MB, so the default is generous for legitimate traffic while keeping a single image from failing the request.

Alternative — one total byte limit — cannot distinguish "one absurd image" from "forty reasonable ones", and the two failure modes want different messages to the model.

A fourth limit, `ARK_TOOL_IMAGE_MAX_BYTES_PER_REQUEST` (15 MiB), bounds the assembled request. The three ingress limits bound what one turn admits; only this one bounds what the model receives, because the image user message is replayed from history on every later turn. Its eviction policy is newest-first retention, with an omitted image replaced by the breadcrumb text.

**Each concern has one owner.**
Review of the first implementation found six defects that shared a cause: the feature was written as point edits at each site the bytes pass through, so image policy, message ordering and the image representation were each decided at whichever call site noticed them first. Four owners replace those call sites. `imagePolicy` resolves the limits once and makes every admission decision, including the wording of a drop. `appendToolOutcomes` owns the message sequence a tool run produces and is used by both the agent loop and the approval resume path. `ToolResultImage` holds one encoding. `applyImageRequestBudget` owns the per-request ceiling. Alternative — fixing each finding where it was reported — leaves the same six call sites free to drift apart again.

**Tool messages for one `tool_calls` block stay contiguous.**
OpenAI rejects a request in which another role interrupts the tool messages answering one assistant `tool_calls` block, and parallel tool calls are the default. Image messages are therefore buffered and appended after the whole tool run rather than after the tool message they came from. Alternative — attaching the image to the tool message's own content parts — is not available: OpenAI does not accept an image part in a `tool` role message.

**An image is encoded once, where its bytes arrive.**
`ToolResultImage` carries the base64 payload and the decoded length, not the raw bytes. Both wire formats that consume it want base64, so nothing on the request path decodes. The earlier shape encoded on the way in, decoded in `imageFromDataURL`, and re-encoded when rendering, costing roughly two extra copies of every image on every turn. The decoded length is derived by arithmetic after a non-allocating validity scan.

**The per-request budget is enforced where the request is assembled.**
`Model.ChatCompletion` is the one point every provider and both the streaming and non-streaming paths pass through, so the ceiling is applied once rather than in each encoder. Newest images are kept: the image the model is being asked about is the one it needs. The stored conversation is untouched — only the outbound copy is trimmed — so a later turn under a raised budget still has the image.

**A dropped image is reported, not hidden.**
Every drop reuses the breadcrumb path already built for an unsupported media type: a line in the tool message text naming the size, the limit, and that the image was not shown. A silently missing image makes the model assert things about an image it never saw. Budget drops write their note into the tool message the image came from rather than a separate message, so the reason sits next to the result that produced it.

## Risks / Trade-offs

- **Context cost.** An image is still large. It is now spent on something the model can use, the base64 no longer appears twice, and the per-turn and per-request budgets put a ceiling on it.
- **Extra base64 round-trip** per image on the Anthropic path → bounded by one encode and one decode per image per request; negligible next to the API call.
- **A long conversation loses its older images** to the per-request budget → the alternative is a request the provider rejects; the omission is stated in the text the model reads, and the stored conversation keeps the image.
- **A provider that rejects image blocks** would now receive them where before it received text → only the shared Anthropic format encoder emits blocks, and both providers on it (Anthropic, Bedrock) accept image blocks in the Messages API.

## Migration Plan

No CRD or API change. The three image limits are optional executor environment variables with defaults, exposed in the chart values, so an install that sets none behaves as the defaults describe. The executor image and its chart are the only artefacts. Rollback is redeploying the previous image; nothing persisted changes shape, and a conversation stored mid-flight replays as an ordinary user message with an image part.

## Open Questions

- Should a tool be able to opt out of image pass-through (for example a tool returning a thumbnail purely as an artefact)? Not needed by any current tool.
- Should an image omitted by the per-request budget be summarised by the model before it is dropped, rather than reduced to a breadcrumb? That needs a model call per eviction and is not obviously worth it.
