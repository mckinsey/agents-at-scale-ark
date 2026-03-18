## Why

`QuerySpec.GetInputMessages()` returns `[]openai.ChatCompletionMessageParamUnion`, forcing every consumer — including potential non-OpenAI engines — to depend on OpenAI types. The CRD stores input as `runtime.RawExtension` (opaque JSON), so protocol-typed accessors can coexist without schema changes.

## What Changes

- Add `GetProtocolInputMessages() ([]protocol.Message, error)` to `QuerySpec` — converts the stored raw JSON into A2A protocol messages
- Add `SetProtocolInputMessages([]protocol.Message) error` to `QuerySpec` — serializes protocol messages back to raw JSON
- Update completions engine `GetQueryInputMessages` to internally call `GetProtocolInputMessages` and convert to its `Message` type, reducing duplication
- Deprecate direct use of `GetInputMessages` / `SetInputMessages` outside the completions engine (soft deprecation via doc comments)

## Non-goals

- Removing `GetInputMessages` / `SetInputMessages` (required for backward compatibility)
- Changing the CRD schema or stored JSON format
- Modifying how the controller reads input (already decoupled via Step 2)

## Compatibility Contract

- Existing `GetInputMessages` / `SetInputMessages` continue to work unchanged
- New protocol-typed accessors produce equivalent messages — round-trip fidelity verified by tests
- No CRD schema change; the raw JSON storage format is unchanged
- Mixed deployments with older controllers or engines unaffected

## Impact

- `ark/api/v1alpha1/query_types.go` (new protocol-typed accessors)
- `ark/executors/completions/query_parameters.go` (delegate to protocol accessor)
