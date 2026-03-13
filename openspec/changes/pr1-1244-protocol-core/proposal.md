# PR1 Protocol Core Adapters

## Why

Internal execution still relies on OpenAI message unions in core interfaces. We need a stable protocol-native message layer before converting agent/team and memory/streaming loops.

## What Changes

- Add protocol message adapter helpers in completions:
  - OpenAI -> protocol conversion
  - protocol -> OpenAI conversion
  - batch conversion helpers
  - protocol message constructors for user, assistant, system, and tool paths
- Add focused unit coverage for adapter behavior.

## Impact

- `ark/executors/completions/protocol_messages.go`
- `ark/executors/completions/protocol_messages_test.go`
