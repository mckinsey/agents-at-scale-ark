---
name: ark-controller-development
description: Guidance for developing the Ark Kubernetes operator. Use when modifying Go types, CRDs, controllers, or webhooks. Helps with CRD generation and Helm chart sync issues.
---

# Ark Controller Development

Guidance for developing the Ark Kubernetes operator in `ark/`.

## When to use this skill

- Modifying Go type definitions (`api/v1alpha1/*_types.go`)
- Fixing CRD/Helm chart sync errors
- Adding new CRD fields or resources

## CRD Generation Flow

```
api/v1alpha1/*_types.go     # Go types with markers
        ↓
    make manifests          # Generates CRDs and syncs to Helm chart
        ↓
config/crd/bases/*.yaml     # Source CRDs (auto-generated)
dist/chart/templates/crd/   # Helm chart CRDs (auto-synced)
```

`make manifests` automatically syncs source CRDs to the Helm chart while preserving templated headers.

## Fixing "CRDs out of sync" Errors

When `make build` fails with CRD validation errors:

```bash
cd ark
make manifests
make build
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `api/v1alpha1/` | Go type definitions |
| `config/crd/bases/` | Auto-generated source CRDs |
| `dist/chart/templates/crd/` | Helm chart CRDs (auto-synced) |
| `internal/controller/` | Reconciliation logic |
| `internal/webhook/` | Admission webhooks |
| `internal/genai/` | AI/ML execution logic |

## Common Tasks

### After Modifying Types or Comments

Go type comments become CRD field descriptions:

```bash
cd ark
make manifests
make build
```

### After Any Go Code Change

```bash
make lint-fix    # Format and fix linting
make build       # Build and validate
```
