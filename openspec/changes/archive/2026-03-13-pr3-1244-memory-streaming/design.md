# PR3 Memory Streaming Protocol Alignment Design

## Decision

Use protocol messages for memory APIs and keep OpenAI message unions only in HTTP payload serialization and provider-facing boundaries.

## Memory Flow

- Add messages: protocol messages -> OpenAI conversion -> memory HTTP payload.
- Get messages: memory HTTP payload -> OpenAI decode -> protocol conversion.

## Compatibility

- Streaming chunk format remains OpenAI-compatible for dashboard and broker consumers.
- Handler keeps response serialization behavior unchanged while bridging protocol memory data.
