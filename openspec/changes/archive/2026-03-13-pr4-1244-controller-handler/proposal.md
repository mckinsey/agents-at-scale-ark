# PR4 Controller Handler Protocol Boundary Cleanup

## Why

Controller and handler still kept OpenAI message unions as their primary in-memory execution state, even after protocol-native loop conversion in completions.

## What Changes

- Convert handler execution state and dispatch paths to protocol-native message arrays.
- Keep model/tool/provider boundaries OpenAI-compatible by explicit conversion in handler execution methods.
- Convert controller success serialization and response content extraction to protocol message inputs.

## Impact

- `ark/executors/completions/handler.go`
- `ark/executors/completions/message_helpers.go`
- `ark/internal/controller/query_controller.go`
- `ark/internal/controller/query_controller_test.go`
