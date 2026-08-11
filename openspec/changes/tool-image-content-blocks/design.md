## Context

`MCPExecutor.Execute` builds the tool message by walking the MCP content parts: text parts are appended, and every other part is `json.MarshalIndent`-ed into the same string. An `ImageContent` part therefore reaches the model as a JSON object with a base64 `data` field inside the tool message text. The model cannot see it, and a page-sized PNG costs tens of thousands of tokens to say nothing.

The two places that need to change are the MCP boundary, where the bytes are currently lost, and the Anthropic request encoder, which only knows how to write a message whose content is a string.

## Goals / Non-Goals

**Goals**
- An agent can answer a question about an image an MCP tool returned.
- Text-only requests keep their existing wire format.

**Non-Goals**
- Images from non-MCP tools (HTTP, built-in). They return no image content today.
- Images through the human-in-the-loop approval resume path in `handler.go`, which rebuilds a `ToolResult` from the tool message text.
- Audio or other non-text modalities.
- Image resizing, re-encoding, or token budgeting.

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

## Risks / Trade-offs

- **Context cost.** An image is still large. It is now spent on something the model can use, and the base64 no longer appears twice (once in the tool text, once nowhere useful). No budgeting is added here.
- **Extra base64 round-trip** per image on the Anthropic path → bounded by one encode and one decode per image per request; negligible next to the API call.
- **The HITL approval path drops images** → out of scope and called out in the proposal; behaviour there is unchanged, not newly broken.
- **A provider that rejects image blocks** would now receive them where before it received text → only the shared Anthropic format encoder emits blocks, and both providers on it (Anthropic, Bedrock) accept image blocks in the Messages API.

## Migration Plan

No CRD, config, or API change. The executor image is the only artefact. Rollback is redeploying the previous image; nothing persisted changes shape, and a conversation stored mid-flight replays as an ordinary user message with an image part.

## Open Questions

- Should a tool be able to opt out of image pass-through (for example a tool returning a thumbnail purely as an artefact)? Not needed by any current tool.
- Should images be capped in count or bytes per turn before they reach the provider?
