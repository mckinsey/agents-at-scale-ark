# PR2 Agent Team Selector Protocol Loops Design

## Decision

Use protocol messages as the canonical in-memory format for agent/team orchestration while preserving OpenAI unions at model/provider and response serialization boundaries.

## Execution Path

- Handler and controller still receive and emit OpenAI-compatible response payloads.
- Member execution (`Agent`, `Team`) now consumes protocol messages.
- Local model execution converts protocol -> OpenAI for model calls, then OpenAI -> protocol for accumulated outputs.
- Team history stores protocol messages with assistant identity carried in metadata.

## Selector History

- Selector prompt history is built from protocol messages.
- Assistant labels fall back to `assistant` when explicit metadata name is absent.
