## 1. Tool Result Carries Images

- [x] 1.1 Add `ToolResultImage` (media type + raw bytes) with `DataURL()` and `Base64()` helpers to `ark/executors/completions/types.go`
- [x] 1.2 Add `Images []ToolResultImage` to `ToolResult`
- [x] 1.3 Add `NewUserImageMessage(caption, images)` building a user message with one image content part per image
- [x] 1.4 Handle `*mcpsdk.ImageContent` in `MCPExecutor.Execute` (`mcp.go`) — collect the bytes, write a one-line note to the tool text, keep the JSON fallback for other part types

## 2. Agent Loop

- [x] 2.1 Add `executeToolCallWithImages` in `agent.go` returning the tool message plus its images; keep `executeToolCall` as the text-only wrapper used by the approval path in `handler.go`
- [x] 2.2 Append a `NewUserImageMessage` after the tool message in `executeToolCalls` when a tool returned images, to both `agentMessages` and `newMessages`

## 3. Anthropic Request Format

- [x] 3.1 Add `extractMessageParts` returning text, images and role; keep `extractMessageContent` as the text-only wrapper
- [x] 3.2 Add `imageFromDataURL` parsing `data:<media type>;base64,<data>` and rejecting anything else
- [x] 3.3 Extend the message content block type with an optional `source` (`anthropicImageSource`), replacing `anthropicMessageContent`
- [x] 3.4 Replace the inline cache-block rendering in `convertMessagesToAnthropic` with `renderAnthropicContent(text, images, cached)` — bare JSON string when there is no image and no cache breakpoint, block array otherwise
- [x] 3.5 Keep a message that carries an image but no text (skip only when both are empty)

## 4. Tests

- [x] 4.1 Add `image_content_test.go` — data URL round-trip and rejection, MCP image part not flattened into text, `NewUserImageMessage` parts, `renderAnthropicContent` output, images preserved through `convertMessagesToAnthropic`
- [x] 4.2 Update `anthropic_format_test.go` for the renamed content block type
- [x] 4.3 `make lint` and `make test` pass in `ark/`

## 5. Media Type Normalisation and Validation

- [x] 5.1 Add `normalizeImageMediaType` — strip RFC 2397 parameters, lower-case, alias `image/jpg` to `image/jpeg`, and reject anything outside the four media types Anthropic and OpenAI both accept
- [x] 5.2 Apply it in `imageFromDataURL` (`anthropic_format.go`) so a parameterised media type is normalised and an unsupported one is rejected
- [x] 5.3 Apply it in `MCPExecutor.Execute` (`mcp.go`) so an unsupported tool image is dropped, with the tool text saying it was not shown to the model
- [x] 5.4 Tests for both entry points, including the OpenAI `image_url` wire shape
- [x] 5.5 Extract `collectContent` from `MCPExecutor.Execute` so the MCP path is tested directly rather than through a copy of the loop

## 6. End-to-End Verification

- [x] 6.1 Deploy the built executor to a cluster with an MCP tool that returns an image and confirm the agent answers a question about it
- [x] 6.2 Confirm a text-only query is unaffected

## 7. Size Limits

- [x] 7.1 Add `image_config.go` with `toolImageLimitsFromEnv` reading `ARK_TOOL_IMAGE_MAX_BYTES` (5 MiB), `ARK_TOOL_IMAGE_MAX_PER_TOOL_CALL` (4) and `ARK_TOOL_IMAGE_MAX_BYTES_PER_TURN` (15 MiB), following the `mcp_config.go` pattern
- [x] 7.2 Enforce the per-image and per-tool-call limits in `collectContent` (`mcp.go`), dropping with the breadcrumb text already used for an unsupported media type
- [x] 7.3 Add `image_budget.go` with `imageTurnBudget`, admitting images greedily against the per-turn budget and returning the note for any it drops
- [x] 7.4 Hold one budget per call of `executeToolCalls` (`agent.go`) and thread it through `executeToolCallWithImages`, appending the note to the tool message text
- [x] 7.5 Expose the three limits in `chart/values.yaml`
- [x] 7.6 Tests — env parsing and fallback, per-image drop and boundary, per-tool-call cap, and the turn budget across two tool calls through `executeToolCalls`
- [x] 7.7 Distinguish the file-gateway 1 MB upload cap from the executor's per-image cap in `docs/content/user-guide/files.mdx`

## 8. S3 Backend Verification

- [x] 8.1 Install file-gateway with `versitygw.backend=s3` against an in-cluster MinIO upstream and confirm `filesystem-mcp` runs with `STORAGE_BACKEND=s3`
- [x] 8.2 Re-run the image query for both the Anthropic and the OpenAI agent and confirm neither reports `NO IMAGE REACHED THE MODEL`
- [x] 8.3 Capture the actual `read-media-file` MCP payload — media type and byte length — as evidence that s3 mode returns an inline `ImageContent` part
- [x] 8.4 Confirm an oversized upload trips the per-image limit end to end rather than erroring the request
- [x] 8.5 Not required — the s3-mode media type is `image/png`, identical to posix mode, so `http.DetectContentType` sniffing is unnecessary

