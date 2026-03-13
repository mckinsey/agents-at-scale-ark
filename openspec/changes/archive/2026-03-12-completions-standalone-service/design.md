## Context

The completions engine was extracted to `executors/completions/` and renamed from query-engine. It currently deploys as a sidecar in the controller pod (prod) or a standalone pod (devspace). The goal is to make it consistently standalone everywhere.

Current state:
```
Production (dist chart)              Dev (devspace)
┌─ ark-controller pod ──────┐       ┌─ ark-controller pod ─┐
│  manager container         │       │  manager              │
│  completions container     │       └───────────────────────┘
│  (sidecar, localhost:9090) │       ┌─ ark-completions pod ─┐
└────────────────────────────┘       │  completions           │
                                     │  (K8s Service :9090)   │
                                     └────────────────────────┘
```

Target state:
```
Both prod and dev:
┌─ ark-controller pod ─┐    ┌─ ark-completions pod ──────┐
│  manager              │───▶│  completions                │
│  --completions-addr=  │    │  K8s Service: ark-completions│
│   http://ark-         │    │  Port: 9090                  │
│   completions.        │    └─────────────────────────────┘
│   ark-system:9090     │
└───────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- Standalone Helm chart for ark-completions (separate release from controller)
- Consistent topology between dev and prod
- ark-cli can install and report status of completions engine
- Documentation reflects current architecture
- CI/CD builds and publishes the chart

**Non-Goals:**
- Multiple executor support (responses, langchain) — future work
- Separate RBAC / ServiceAccount for completions — shares controller SA for now
- Independent versioning — chart version stays locked to ark release

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chart location | `ark/executors/completions/chart/` (separate from controller) | Enables independent scaling, matches future multi-executor vision |
| Helm release | Separate release `ark-completions` | Independent upgrade/rollback from controller |
| ServiceAccount | Shares `ark-controller` SA | Same trust boundary, simplest path. Own SA is future work |
| Controller default addr | `http://ark-completions.ark-system:9090` | K8s service DNS, works in both dev and prod |
| Dev chart | Remove `charts/ark-completions-dev/`, use production chart for both | One chart to maintain, devspace overrides values |
| ark-cli category | `core` (alongside ark-controller) | Completions is required for query execution |
| Doc file rename | `ark-query-engine.mdx` → `ark-completions.mdx` | Match new naming |

## Risks / Trade-offs

**Risk: Network hop in prod.** Sidecar was localhost, standalone adds a K8s service hop. Latency impact is negligible for LLM workloads (milliseconds vs seconds).

**Risk: Two releases to manage.** Controller and completions are now separate Helm releases. ark-cli handles install ordering. Version lock mitigates drift.

**Trade-off: Shared ServiceAccount.** Completions gets the same RBAC as the controller. Acceptable for now since it already reads the same CRDs. Separate SA is a natural follow-up when executors need different permissions.

**Trade-off: Removing dev chart.** Using the production chart for dev means devspace needs to pass image overrides. This is standard practice and simplifies maintenance.
