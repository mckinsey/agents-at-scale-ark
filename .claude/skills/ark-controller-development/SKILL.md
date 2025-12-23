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
    make manifests          # Generates CRDs
        ↓
config/crd/bases/*.yaml     # Source CRDs (auto-generated)
        ↓
    manual merge            # Merge spec into Helm chart
        ↓
dist/chart/templates/crd/   # Helm chart CRDs (has templating)
```

## Fixing "CRDs out of sync" Errors

When `make build` fails with CRD validation errors:

```bash
cd ark
make manifests
```

Then manually update each failing CRD in `dist/chart/templates/crd/`.

**Important:** Don't just copy files. The Helm chart CRDs have templated headers:

```yaml
{{- if .Values.crd.enable }}
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  labels:
    {{- include "chart.labels" . | nindent 4 }}
  annotations:
    {{- if .Values.crd.keep }}
    "helm.sh/resource-policy": keep
    {{- end }}
    controller-gen.kubebuilder.io/version: v0.18.0
  name: <resource>.ark.mckinsey.com
spec:
  # ... rest matches source CRD
```

Copy the `spec:` content from `config/crd/bases/` while keeping the Helm header intact.

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `api/v1alpha1/` | Go type definitions |
| `config/crd/bases/` | Auto-generated source CRDs |
| `dist/chart/templates/crd/` | Helm chart CRDs (templated header) |
| `internal/controller/` | Reconciliation logic |
| `internal/webhook/` | Admission webhooks |
| `internal/genai/` | AI/ML execution logic |

## Common Tasks

### After Modifying Types or Comments

Go type comments become CRD field descriptions:

```bash
cd ark
make manifests
# Then merge spec changes into dist/chart/templates/crd/
make build
```

### After Any Go Code Change

```bash
make lint-fix    # Format and fix linting
make build       # Build and validate
```
