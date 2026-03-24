## Why

The controller's `extractUserInput` calls `completions.GetQueryInputMessages` to extract user text from queries. This creates a direct import dependency from the controller package to the completions engine, meaning any execution engine change can break the controller. The controller should not need to know how an engine parses messages.

## What Changes

- Add `query_input.go` to the existing `ark/internal/resolution` package with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)` — an engine-agnostic resolver that handles both `user` and `messages` query types using only `json.RawMessage` parsing
- Add `query_input_test.go` with unit tests covering all query types, parameter sources, and error conditions
- Update controller `extractUserInput` (at `query_controller.go:399`) to call the shared resolver instead of `completions.GetQueryInputMessages`
- Refactor completions `resolveConfigMapKeyRef` (at `query_parameters.go:72`) and `resolveSecretKeyRef` (`:85`) to delegate to existing `resolution.ResolveFromConfigMap` and `resolution.ResolveFromSecret` (at `headers.go:85` and `:66`), eliminating duplicate code

## Non-goals

- Changing the completions engine's internal input parsing
- Modifying the Query CRD schema
- Removing `GetQueryInputMessages` from completions (still used internally by the engine)

## Compatibility Contract

- No behavioral change to query input resolution — the shared resolver produces the same text output as the previous controller path
- Completions engine continues to use its own `GetQueryInputMessages` internally; no change to engine behavior
- Mixed deployments unaffected — this is a controller-internal refactor with no wire format changes

## Impact

- `ark/internal/resolution/query_input.go` (new)
- `ark/internal/resolution/query_input_test.go` (new)
- `ark/internal/controller/query_controller.go`
- `ark/executors/completions/query_parameters.go`
