# Ark API Server Benchmark

Compares Ark's aggregated API server (PostgreSQL) against standard Kubernetes CRDs (etcd).

## Quickstart

```bash
make help

make run              # benchmark current cluster mode (auto-detect)
make run-etcd         # deploy etcd mode and benchmark
make run-postgres     # deploy PostgreSQL mode and benchmark
make run-comparison   # run both modes and compare

make gate             # check latest results against thresholds
```

## Prerequisites

- Go 1.24+
- kubectl with cluster access
- Helm 3
- Ark controller image loaded in cluster

cert-manager is installed automatically if missing.

## Modes

| Mode | What happens |
|------|-------------|
| `auto` | Detects current backend from Helm, benchmarks without redeploying |
| `etcd` | Deploys etcd mode, installs CRDs, benchmarks |
| `postgres` | Deploys PostgreSQL mode, benchmarks |
| `both` | Runs etcd then PostgreSQL, prints comparison table |

## Tests

### Basic CRUD (`apiserver-bench`)

Runs against the Kubernetes API via `k8s.io/client-go` dynamic client:

| Operation | Description |
|-----------|-------------|
| Create | N objects with configurable concurrency |
| Get | 10x reads cycling over N objects |
| List | 100 list calls |
| Watch | 50 events with send/receive latency |
| Delete | N objects |

Latencies recorded with HDR histograms (P50/P95/P99). Output: text + JSON.

### Production Scenarios (`production-bench`)

| Scenario | Description |
|----------|-------------|
| `concurrent` | Throughput at concurrency [10, 50, 100, 200, 500] |
| `watch-density` | Fan-out with [1, 10, 50, 100, 200] concurrent watchers |
| `mixed` | 60s at 100 ops/s: 60% create, 20% get, 10% list, 10% delete |
| `saturation` | Rate-limited at [50, 100, 200, 500, 1000] ops/s to find ceiling |

## Configuration

All options available via `make` variables or `run.sh` flags:

```bash
make run OBJECTS=100,1000,10000 CONCURRENCY=20
make run-etcd SCENARIOS=concurrent

./run.sh --mode auto --scenarios none --objects 100,1000
./run.sh --mode both --objects 100,1000 --output-dir my-results
```

| Variable | Default | Description |
|----------|---------|-------------|
| `KUBECONFIG` | `~/.kube/config` | Path to kubeconfig |
| `NAMESPACE` | `ark-benchmark` | Benchmark namespace |
| `OBJECTS` | `100,1000` | Comma-separated object counts |
| `CONCURRENCY` | `10` | Worker count |
| `SCENARIOS` | `all` | Production scenarios (`all`, `none`, or specific) |
| `OUTPUT_DIR` | `results` | Results directory |

## Performance Gates

The `benchmark-gate` tool checks results against configurable thresholds.

### Thresholds file (`thresholds.yaml`)

```yaml
operations:
  create:
    max_error_rate: 0.01    # max 1% errors
    max_p99_ms: 500         # max P99 latency in ms
    min_throughput: 50      # min ops/sec
  get:
    max_error_rate: 0.01
    max_p99_ms: 200
    min_throughput: 100
```

Each operation can define any combination of:
- `max_error_rate` — fraction (0.01 = 1%)
- `max_p99_ms` — P99 latency ceiling in milliseconds
- `min_throughput` — minimum ops/sec floor

### Usage

```bash
make gate                                # check latest results
make gate THRESHOLDS=strict.yaml         # use custom thresholds

./benchmark-gate -results results/20260304-120347/etcd-100.json -thresholds thresholds.yaml
```

Exits 0 if all gates pass, 1 if any threshold is breached.

## CI/CD

A dedicated GitHub Actions workflow runs benchmarks on demand.

**Workflow:** `.github/workflows/benchmark.yaml` (manual dispatch)

| Input | Default | Description |
|-------|---------|-------------|
| `mode` | `auto` | Storage mode: `auto`, `etcd`, `postgres`, `both` |
| `objects` | `100` | Comma-separated object counts |
| `concurrency` | `10` | Worker concurrency |
| `thresholds` | `thresholds.yaml` | Path to thresholds file |
| `gate_enabled` | `true` | Fail workflow if thresholds are breached |

The workflow provisions a k3s cluster, deploys Ark, runs benchmarks, checks gates, and uploads results as artifacts.

## Results

Results are saved to `results/<timestamp>/`:

```
results/20260304-120000/
├── etcd-100.json
├── etcd-100.txt
├── etcd-1000.json
├── etcd-1000.txt
├── etcd-production.txt
├── postgres-100.json
├── postgres-100.txt
├── postgres-1000.json
├── postgres-1000.txt
└── postgres-production.txt
```

JSON files contain per-operation throughput, latency percentiles, and error counts. These are consumed by `benchmark-gate` for threshold checks.

Results are gitignored — each run generates its own.

## Running on GKE

Same scripts, point at a GKE cluster:

```bash
gcloud container clusters get-credentials CLUSTER --region REGION
make run-comparison
```

Use dedicated node pools and consistent machine types for meaningful results.

## Report

See [ARK-APISERVER-BENCHMARK-REPORT.md](ARK-APISERVER-BENCHMARK-REPORT.md) for the full Jan 2026 GKE benchmark report with analysis and production capacity planning.
