# Ark Kubernetes Operator

Kubernetes operator managing AI agents, models, queries, and teams. Built with controller-runtime.

## Build Commands

```bash
make dev           # Run locally without webhooks
make build         # Build (includes CRD validation)
make test          # Run tests
make lint-fix      # Format and fix linting
make manifests     # Regenerate CRDs from Go types
```

## Key Patterns

### ValueSource Configuration
Resources support flexible configuration through `ValueSource`:
- Direct values
- ConfigMap/Secret references
- Service references

### Parameter Templating
Dynamic prompt/input processing using Go templates with resource context.

## CRD Changes

When modifying Go types in `api/v1alpha1/`, use the `ark-controller-development` skill for guidance on syncing CRDs to the Helm chart.

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
// In mutating webhook (CustomDefaulter)
model.Annotations[annotations.MigrationWarningPrefix+"provider"] = fmt.Sprintf(
    "spec.type is deprecated for provider values - migrated '%s' to spec.provider",
    originalType,
)

// In validating webhook (CustomValidator)
return collectMigrationWarnings(model.Annotations), nil
```

See `internal/annotations/annotations.go` for `MigrationWarningPrefix` and `internal/webhook/v1/model_webhook.go` for implementation.

## Testing

### Unit Tests
```bash
make test          # Run all tests
go test ./internal/controller/... -v
go test ./internal/webhook/... -v
```
