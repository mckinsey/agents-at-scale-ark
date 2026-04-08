# Ark Kubernetes Operator

Kubernetes operator managing AI resources. Built with controller-runtime. The controller is the orchestration layer — it reconciles CRDs and dispatches query execution to executors via A2A.

## Build Commands

```bash
make dev           # Run locally without webhooks
make build         # Build (includes CRD validation)
make test          # Run tests
make lint-fix      # Format and fix linting
make manifests     # Regenerate CRDs from Go types
```

## Architecture

### Controller as Orchestrator
The controller watches CRDs (Agent, Model, Query, Team, MCPServer, ExecutionEngine, A2AServer) and dispatches queries to executors. It is the sole writer of Query CR status.

### Executor Dispatch
When a Query arrives, the controller checks the target Agent's `executionEngine` field:
- **Not set** → built-in completions executor (`executors/completions/`)
- **Named executor** → fetches the ExecutionEngine CR, dispatches to its resolved address via A2A

The ExecutionEngine CRD (`api/v1prealpha1/`) defines external executors with an `address` (ValueSource). Custom executors implement `BaseExecutor` from the Python SDK (`lib/ark-sdk/`) and are hosted as A2A-compliant servers.

### Key CRD Types
- `api/v1alpha1/` — Agent, Model, Query, Team, Tool, MCPServer, A2AServer, A2ATask, Memory
- `api/v1prealpha1/` — ExecutionEngine

## Key Patterns

### ValueSource Configuration
Resources support flexible configuration through `ValueSource`:
- Direct values
- ConfigMap/Secret references
- Service references

### Parameter Templating
Dynamic prompt/input processing using Go templates with resource context.

### Tool Integration
- Built-in tools (web search, calculations)
- HTTP fetcher tools for API integration
- MCP server tools for external service integration

### Migration Warnings
When deprecating fields or changing resource formats, use the migration warning pattern:

1. **Mutating webhook** detects old format and migrates it
2. **Add annotation** `annotations.MigrationWarningPrefix + "name"` with warning message
3. **Validating webhook** calls `collectMigrationWarnings()` to return warnings to user

```go
model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
    "spec.type is deprecated for provider values - migrated '%s' to spec.provider",
    originalType,
)
```

See `internal/annotations/annotations.go` for `MigrationWarningPrefix` and `internal/webhook/v1/model_webhook.go` for implementation.

## CRD Changes

When modifying Go types in `api/v1alpha1/`, use the `ark-controller-development` skill for guidance on syncing CRDs to the Helm chart.

## Testing

### Unit Tests
```bash
make test          # Run all tests
go test ./internal/controller/... -v
go test ./internal/webhook/... -v
```
