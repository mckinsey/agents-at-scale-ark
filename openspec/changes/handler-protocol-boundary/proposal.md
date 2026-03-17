## Why

`buildA2AResponse` currently receives `[]Message` (OpenAI-typed) from the execution result and converts them to protocol messages for the A2A response. This means the handler's primary path is OpenAI → protocol. After steps 4a and 4b, internal orchestration can produce protocol messages directly. The handler should then operate protocol-first, with OpenAI conversion only as a compatibility path for `response.raw`.

## What Changes

- Refactor `buildA2AResponse` to accept `[]protocol.Message` as its primary input
- Move the OpenAI-to-protocol conversion (`openAIToProtocolResponseMessages`) from the main path to an adapter called only when the execution result provides OpenAI-typed messages
- Update the `messages` metadata (legacy OpenAI JSON for `response.raw`) generation to use a protocol-to-OpenAI serializer at the handler boundary
- Ensure the dual-write pattern (both `responseMessagesV1` and `messages`) continues to work with protocol messages as the source of truth

## Non-goals

- Removing OpenAI type support from the handler (needed for backward compatibility with existing execution paths)
- Changing the A2A response wire format
- Modifying how `ExecutionResult` is structured

## Compatibility Contract

- The A2A response format remains unchanged — both `responseMessagesV1` and `messages` metadata continue to be populated
- `buildA2AResponse` continues to accept OpenAI-typed results through an adapter path
- The conversion direction change is internal to the handler; callers and consumers see no difference
- Mixed deployments with agents producing either message type are supported through the adapter

## Impact

- `ark/executors/completions/handler.go` (major refactor of `buildA2AResponse`)
- `ark/executors/completions/execution_result.go` (optional: add protocol message field to result)
