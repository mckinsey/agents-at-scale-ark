## Why

Each step in the protocol-native transport migration introduces compatibility adapters (dual-write response paths, interface adapters, type converters). These adapters will remain in the codebase for an extended period to support mixed deployments and gradual consumer migration. Without governance, adapters accumulate inconsistently, become untested, or are removed prematurely — breaking deployments that depend on them.

## What Changes

- Establish adapter organization conventions: all compatibility adapters colocated in clearly identified files or packages with consistent naming
- Define a parity verification strategy: automated tests ensuring protocol-native and legacy paths produce equivalent outputs
- Create a mixed-deployment testing matrix: test configurations that exercise combinations of new and old controllers, executors, and clients
- Document retirement criteria: measurable conditions (telemetry thresholds, version support windows, migration completion) under which specific adapters may be deprecated and eventually removed
- Add adapter inventory documentation tracking each adapter's purpose, introduction step, and status

## Non-goals

- Removing any adapters (this step defines when and how removal happens, not the removal itself)
- Adding new protocol-native functionality (covered by steps 1–4)
- Changing the adapter implementations

## Compatibility Contract

- All existing adapters remain in place and functional
- No behavioral changes to any adapter — this step is governance and testing infrastructure only
- Retirement criteria are documented but no removal timeline is committed
- Mixed-deployment testing validates that all supported deployment combinations work correctly

## Impact

- `ark/executors/completions/` (adapter file organization, test additions)
- `ark/internal/controller/` (test additions for mixed-deployment scenarios)
- Testing infrastructure (new test configurations and matrix)
- Documentation (adapter inventory, retirement criteria)
