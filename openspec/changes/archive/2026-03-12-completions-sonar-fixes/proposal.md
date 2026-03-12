## Why

SonarQube flagged 11 issues on the completions extraction PR — 3 failures (cognitive complexity, clear-text protocol) and 8 warnings (parameter counts, unused context, style). Most are pre-existing code smells surfaced by file moves, but they block PR merge. Additionally, the e2e CI fails because the completions Helm chart installs before the controller chart creates the ServiceAccount it depends on. Codecov also flagged low patch coverage on the new `resolution/headers.go` and `a2a/a2a.go` packages.

## What Changes

- Fix 3 SonarQube failures: reduce cognitive complexity in `a2a.go` and `evaluation_controller.go`, suppress clear-text HTTP warning in values.yaml
- Fix 8 SonarQube warnings: reduce parameter counts via option structs, fix context usage, inline unnecessary variables, add `automountServiceAccountToken`
- Fix e2e CI: swap Helm install order so controller (creates SA) installs before completions (uses SA)
- Add test coverage for `resolution/headers.go` edge cases and `a2a/a2a.go` extracted code

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `ark/internal/a2a/a2a.go` — extract helper to reduce complexity
- `ark/internal/controller/evaluation_controller.go` — extract helper to reduce complexity
- `ark/executors/completions/a2a_execution.go` — introduce stream state struct for parameter reduction
- `ark/executors/completions/handler.go` — use existing executionState for parameter reduction
- `ark/executors/completions/agent_tools.go` — introduce deps struct for parameter reduction
- `ark/internal/mcp/pool.go` — introduce config struct for parameter reduction
- `ark/internal/controller/model_probe.go` — fix context usage
- `ark/executors/completions/mcp.go` — fix context usage, inline variable
- `ark/executors/completions/chart/templates/deployment.yaml` — add automountServiceAccountToken
- `ark/dist/chart/values.yaml` — annotate clear-text HTTP
- `.github/actions/setup-e2e/setup-local.sh` — swap install order
- `.github/actions/test-ark-cli/action.yaml` — swap install order
- `ark/internal/resolution/headers_test.go` — add edge case coverage
- `ark/internal/a2a/a2a_test.go` — add coverage for extracted functions
