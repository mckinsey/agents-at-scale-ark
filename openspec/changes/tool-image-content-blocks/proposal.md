## Why

An MCP tool that returns an image reaches the model as text. The completions executor JSON-marshals every non-text MCP content part into the tool message, so an image arrives as a base64 string the model cannot see — it either invents a reading of a picture it never saw or blows the context limit. The only workaround today is a tool backed by its own pod that fetches the file and calls a vision API itself, so every tool that reads an image pays for its own deployment and credentials.

## What Changes

- Carry image bytes from an MCP tool result through `ToolResult.Images` instead of flattening them into the tool message text
- Append a user message holding those images after the tool message, so the model is shown the image on the next turn
- Emit Anthropic `image` content blocks for messages that carry images; message content becomes a JSON string *or* a block array
- Text-only requests keep their existing wire format, byte for byte

## Capabilities

### New Capabilities
- `tool-image-content`: images returned by a tool reach the model as image content rather than text

### Modified Capabilities

## Impact

- **Go executor** (`ark/executors/completions/`): `mcp.go` (image content parts), `types.go` (`ToolResult.Images`, `ToolResultImage`, `NewUserImageMessage`), `agent.go` (image message after a tool call), `anthropic_format.go` (image blocks, part extraction)
- **Providers**: Anthropic and Bedrock share `anthropic_format.go` and both gain image blocks. OpenAI/Azure carry the OpenAI-native image content part with no provider change.
- **No CRD, API, Dashboard, or CLI change.** No new dependencies.
- **Not covered**: the human-in-the-loop approval resume path in `handler.go` rebuilds a `ToolResult` from the tool message and drops images; tools other than MCP (HTTP, built-in) return no images.
