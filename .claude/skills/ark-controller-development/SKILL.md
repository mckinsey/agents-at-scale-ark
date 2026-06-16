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
make lint-fix    # Format and auto-fix what the linter can fix
make lint        # Fail fast on issues CI will reject — MANDATORY
make build       # Build and validate
make test        # Run unit + envtest suites
```

### Before Opening a PR

Run the chainsaw e2e suite against a live cluster — unit + envtest
don't exercise the full apply → reconcile → status loop. Prefer the
deterministic mock-llm suite; only run the LLM-backed tests when the
change specifically touches that path (saves cost + avoids flakes from
real LLM providers).

```bash
# Deterministic suite (default)
(cd tests && chainsaw test --selector '!llm')

# LLM suite — only when your change needs it
(cd tests && chainsaw test --selector 'llm')
```

See the `chainsaw` skill for patterns and antipatterns (e.g. prefer
chainsaw `assert` over shell `grep`; prefer `wait` over polling).

`make lint` runs the same `golangci-lint` rules CI enforces. Running it
locally before pushing is non-negotiable — red PR checks cost more than
the minute the lint takes.

## Leverage Existing Code — Don't Reinvent

Before writing a parser, struct, helper, retry loop, URL builder, or
any utility, check whether it already exists in:

1. Go standard library.
2. Direct or transitive dependencies in `go.mod` (`controller-runtime`, `apimachinery`, the SDK for whatever spec you're implementing, `golang.org/x/...`).

Hand-rolled code drifts, duplicates tests, and becomes maintenance
burden. A short adapter delegating to a library is almost always better
than a reimplementation.

Heuristic: if the thing you're writing mirrors an existing spec, file
format, header syntax, or common infra pattern, **someone has already
written it**. Search first: `go doc <import-path>`, `ls $(go env GOMODCACHE)/<dep>`.

Re-export library types via alias (`type X = lib.X`) rather than
defining a parallel struct with the same fields.

### Worked example

Started this project by hand-rolling a WWW-Authenticate parser, RFC 9728
struct, RFC 8414 struct, and HTTP fetchers — ~150 LOC. The go-sdk
already shipped them in `oauthex`:

```go
// Bad — 40-line parser, partial struct, duplicated HTTP wrapper.
func parseHeader(h string) (string, bool) { /* ... */ }
type Metadata struct { /* partial mirror of RFC */ }
func fetch(ctx, url) (*Metadata, error) { /* 30 lines */ }

// Good — thin adapter, full spec support, ~10 LOC.
import "github.com/modelcontextprotocol/go-sdk/oauthex"
type Metadata = oauthex.ProtectedResourceMetadata
func Fetch(ctx context.Context, metaURL, resourceURL string, timeout time.Duration) (*Metadata, error) {
    return oauthex.GetProtectedResourceMetadata(ctx, metaURL, resourceURL, &http.Client{Timeout: timeout})
}
```

Same principle applies to retry/backoff (`k8s.io/apimachinery/pkg/util/wait`),
JSON patch (`strategicpatch`), condition updates
(`meta.SetStatusCondition`), HTTP clients, workqueues — whatever you're
touching, check the existing deps first.

## Avoid Magic Numbers — Reuse Configurable Values

Never inline numeric durations, retry counts, or buffer sizes. Priority:

1. **User-configurable spec field** — if the resource already has
   `spec.timeout`, `spec.pollInterval`, `spec.retries`, use it. One
   operator knob should govern all related code paths in the same
   reconcile.
2. **Package-level const** with a name explaining *why* that number.
3. **Test-local const** (e.g. `const testTimeout = 5 * time.Second`) —
   never inline literals in tests.

### Worked example

```go
// Bad — parallel constant invented out of thin air.
const discoveryTimeout = 10 * time.Second
client := &http.Client{Timeout: discoveryTimeout}

// Good — plumb the MCPServer's spec.timeout; single source of truth.
func Fetch(ctx, url string, timeout time.Duration) ...
timeout := parseTimeout(mcpServer.Spec.Timeout)
```

## Testing — not optional

Every code change ships with tests. A PR touching `ark/internal/` with
no `_test.go` is incomplete. Applies to controller branches, webhooks,
helpers — not just public APIs.

| Change | Where | Framework |
|--------|-------|-----------|
| Helper / parser in `internal/<pkg>/` | `<file>_test.go` | stdlib `testing`, table-driven |
| Controller branch | `internal/controller/<scenario>_test.go` | Ginkgo + envtest |
| Webhook rule | `internal/webhook/v1/<resource>_webhook_test.go` | Ginkgo |
| HTTP logic | `httptest.NewServer` in same package | stdlib `testing` |

Required coverage for a controller branch:
- Happy path → expected status + conditions.
- Each failure mode → distinct stable condition reason (no string-matching).
- Idempotency → re-reconcile doesn't emit duplicate events or bump `lastTransitionTime`.
- Regression guard → pre-existing branches unaffected.

## Completion Checklist

Before saying "done":

- [ ] `make manifests` clean (if types changed)
- [ ] `make lint` clean — same rules CI enforces
- [ ] `make build` green
- [ ] `make test` green — paste or reference output
- [ ] Chainsaw deterministic suite (`chainsaw test --selector '!llm'`) green; LLM suite only if change requires it
- [ ] New `_test.go` exists for every new function / branch
- [ ] Helm chart CRDs regenerated and committed
- [ ] OpenAPI / Python SDK / TypeScript SDK regenerated if CRD changed
- [ ] **Running pod re-verified** — devspace syncs source, but only a container restart picks up new Go binaries; tail controller logs after any reconciliation-path change
