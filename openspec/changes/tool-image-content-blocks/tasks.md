## 1. Tool Result Carries Images

- [ ] 1.1 Add `ToolResultImage` (media type + raw bytes) with `DataURL()` and `Base64()` helpers to `ark/executors/completions/types.go`
- [ ] 1.2 Add `Images []ToolResultImage` to `ToolResult`
- [ ] 1.3 Add `NewUserImageMessage(caption, images)` building a user message with one image content part per image
- [ ] 1.4 Handle `*mcpsdk.ImageContent` in `MCPExecutor.Execute` (`mcp.go`) — collect the bytes, write a one-line note to the tool text, keep the JSON fallback for other part types

## 2. Agent Loop

- [ ] 2.1 Add `executeToolCallWithImages` in `agent.go` returning the tool message plus its images; keep `executeToolCall` as the text-only wrapper used by the approval path in `handler.go`
- [ ] 2.2 Append a `NewUserImageMessage` after the tool message in `executeToolCalls` when a tool returned images, to both `agentMessages` and `newMessages`

## 3. Anthropic Request Format

- [ ] 3.1 Add `extractMessageParts` returning text, images and role; keep `extractMessageContent` as the text-only wrapper
- [ ] 3.2 Add `imageFromDataURL` parsing `data:<media type>;base64,<data>` and rejecting anything else
- [ ] 3.3 Extend the message content block type with an optional `source` (`anthropicImageSource`), replacing `anthropicMessageContent`
- [ ] 3.4 Replace the inline cache-block rendering in `convertMessagesToAnthropic` with `renderAnthropicContent(text, images, cached)` — bare JSON string when there is no image and no cache breakpoint, block array otherwise
- [ ] 3.5 Keep a message that carries an image but no text (skip only when both are empty)

## 4. Tests

- [ ] 4.1 Add `image_content_test.go` — data URL round-trip and rejection, MCP image part not flattened into text, `NewUserImageMessage` parts, `renderAnthropicContent` output, images preserved through `convertMessagesToAnthropic`
- [ ] 4.2 Update `anthropic_format_test.go` for the renamed content block type
- [ ] 4.3 `make lint` and `make test` pass in `ark/`

## 5. End-to-End Verification

- [ ] 5.1 Deploy the built executor to a cluster with an MCP tool that returns an image and confirm the agent answers a question about it
- [ ] 5.2 Confirm a text-only query is unaffected
