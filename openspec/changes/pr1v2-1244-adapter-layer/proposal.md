## Why

PR-A established full-fidelity `OpenAI→Protocol` conversion using DataParts in `handler.go` (`openAIToProtocolResponseMessages`). The reverse direction (`Protocol→OpenAI`) is still ad-hoc: `protocolMessagesToRawJSON` in the controller reconstructs JSON strings but doesn't produce typed OpenAI message unions. The agent execution loop needs typed `Protocol→OpenAI` conversion at the LLM call boundary.

## What Changes

- Introduce a dedicated adapter module consolidating both conversion directions.
- Move `openAIToProtocolResponseMessages` (and its helpers) from `handler.go` to the adapter.
- Add `Protocol→OpenAI` conversion: expand DataParts back to typed `ChatCompletionMessageParamUnion` values for the LLM provider boundary.
- Round-trip tests proving no information loss through `OpenAI→Protocol→OpenAI`.

## Prerequisites

- PR-A merged: generic extension helpers, DataPart helpers (`ExtractDataParts`, `DataPartType`, `DataPartField`, `DataPartMap`), full-fidelity `openAIToProtocolResponseMessages`, and `protocolMessagesToRawJSON` available.

## Capabilities

### New Capabilities
- `protocol-openai-adapter`: Consolidated bidirectional adapter with round-trip fidelity guarantees.

### Modified Capabilities
- `a2a-boundary-contract` (PR-A): `openAIToProtocolResponseMessages` relocated to adapter module; handler delegates to adapter.

## Impact

- `ark/executors/completions/protocol_messages.go` (new — adapter module)
- `ark/executors/completions/protocol_messages_test.go` (new — round-trip tests)
- `ark/executors/completions/handler.go` (modified — delegates to adapter)
- `ark/executors/completions/types.go`
