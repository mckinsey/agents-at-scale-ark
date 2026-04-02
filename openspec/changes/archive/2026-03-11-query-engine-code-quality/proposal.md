## Why

The query engine handler has 3 nolint directives suppressing legitimate lint warnings (complexity and duplication), and SonarQube flags 5 issues on the PR (empty functions, missing comments, missing storage requests). These should be fixed before merging to keep code quality consistent.

## What Changes

- Refactor `ProcessMessage` in `handler.go` to reduce cyclomatic/cognitive complexity by extracting phases into separate methods
- Eliminate `executeAgent`/`executeTeam` duplication by unifying into a single function using the existing `TeamMember` interface
- Fix 5 SonarQube issues: add comment to blank import, add storage request to query engine Helm values, add body comments to 3 empty noop emitter functions

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `ark/internal/queryengine/handler.go` — refactor ProcessMessage, unify agent/team execution
- `ark/internal/eventing/config/provider.go` — noop emitter comments
- `ark/cmd/query-engine/main.go` — blank import comment
- `ark/dist/chart/values.yaml` — ephemeral-storage request for query engine container
