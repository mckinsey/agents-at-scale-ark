## Why

The controller's `extractUserInput` calls `completions.GetQueryInputMessages` to extract user text from queries. This creates a direct import dependency from the controller package to the completions engine, meaning any execution engine change can break the controller. The controller should not need to know how an engine parses messages.

## What Changes

- Create `ark/internal/resolution/query_input.go` with `ResolveQueryInputText(ctx, query, k8sClient) (string, error)` — an engine-agnostic resolver that handles both `user` and `messages` query types using only `json.RawMessage` parsing
- Create `ark/internal/resolution/query_input_test.go` with unit tests covering all query types, parameter sources, and error conditions
- Update controller `extractUserInput` to call the shared resolver instead of `completions.GetQueryInputMessages`
- Refactor `completions/query_parameters.go` to delegate ConfigMap/Secret resolution to shared `resolution.ResolveFromConfigMap` / `resolution.ResolveFromSecret` helpers, eliminating duplicate code

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
