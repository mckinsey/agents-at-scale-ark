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
