# PR3 Memory Streaming Protocol Alignment

## Why

Memory interface boundaries still pass OpenAI message unions through internal execution flows. This keeps state persistence tied to provider-specific message shape.

## What Changes

- Convert memory interface contracts to protocol-native message types.
- Keep compatibility with memory HTTP service payloads by converting at transport boundaries.
- Align handler memory load/save paths to use protocol conversions.

## Impact

- `ark/executors/completions/memory.go`
- `ark/executors/completions/memory_http.go`
- `ark/executors/completions/memory_noop.go`
- `ark/executors/completions/handler.go`
- `ark/executors/completions/memory_http_test.go`
