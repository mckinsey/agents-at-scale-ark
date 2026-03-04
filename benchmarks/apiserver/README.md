# Ark API Server Benchmark

Benchmarks comparing Ark's aggregated API server (PostgreSQL) against standard Kubernetes CRDs (etcd).

## Quick Start

```bash
make help

# Benchmark current cluster mode (auto-detect)
make run

# Benchmark specific mode
make run-etcd
make run-postgres

# Full comparison (deploys both modes sequentially)
make run-comparison
```

## Prerequisites

- Go 1.24+
- kubectl with cluster access
- Helm 3
- cert-manager (installed automatically if missing)
- Ark controller image loaded in cluster

## What It Tests

### Basic CRUD (`apiserver-bench`)

Runs against the Kubernetes API (via `k8s.io/client-go` dynamic client):
- **Create** — N objects with configurable concurrency
- **Get** — 10x reads cycling over N objects
- **List** — 100 list calls
- **Watch** — 50 events with send/receive latency
- **Delete** — N objects

All latencies recorded with HDR histograms (P50/P95/P99). Output: text + JSON.

### Production Scenarios (`production-bench`)

- **concurrent** — throughput at concurrency [10, 50, 100, 200, 500]
- **watch-density** — fan-out with [1, 10, 50, 100, 200] concurrent watchers
- **mixed** — 60s at 100 ops/s: 60% create, 20% get, 10% list, 10% delete
- **saturation** — rate-limited at [50, 100, 200, 500, 1000] ops/s to find ceiling

## Usage

```bash
# Build binaries
make build

# Run with custom parameters
make run OBJECTS=100,1000,10000 CONCURRENCY=20

# Run only production scenarios
./run.sh --mode auto --scenarios concurrent --objects 100

# Skip production scenarios
./run.sh --mode auto --scenarios none --objects 100,1000

# Full comparison with custom output
./run.sh --mode both --objects 100,1000 --output-dir my-results
```

## Modes

| Mode | Storage | What Happens |
|------|---------|-------------|
| `auto` | Detect from Helm | Benchmarks current mode without redeploying |
| `etcd` | CRDs → etcd | Deploys etcd mode, installs CRDs, benchmarks |
| `postgres` | Aggregated API → PostgreSQL | Deploys PostgreSQL mode, benchmarks |
| `both` | Sequential | Runs etcd then PostgreSQL, prints comparison |

## Running on GKE

Same scripts, just point at a GKE cluster:

```bash
gcloud container clusters get-credentials CLUSTER --region REGION
make run-comparison KUBECONFIG=~/.kube/config
```

For meaningful results, use a cluster with dedicated node pools and consistent machine types.

## Results

Results are saved to `results/<timestamp>/`:

```
results/20260304-120000/
├── etcd-100.json           # Basic CRUD, 100 objects
├── etcd-100.txt            # Human-readable output
├── etcd-1000.json
├── etcd-1000.txt
├── etcd-production.txt     # Production scenarios
├── postgres-100.json
├── postgres-100.txt
├── postgres-1000.json
├── postgres-1000.txt
└── postgres-production.txt
```

JSON format includes per-operation throughput, latency percentiles, and error counts.

## Baseline Results (GKE, Jan 2026)

Reference numbers from GKE v1.34.1, 3 nodes, PostgreSQL v16:

| Metric | etcd | PostgreSQL |
|--------|------|------------|
| LIST 10K P50 | 2,980ms | 1,504ms |
| LIST 10K throughput | 6.1/s | 12.5/s |
| CRUD P50 | ~105ms | ~106ms |
| Watch P50 | - | 73ms |
| Sustained throughput | - | 180 ops/s |
| Burst throughput | - | 230 ops/s |

Full baseline data in `results/baseline-2026-01-27/`.

## CI/CD

The script is designed for CI pipelines. Example GitHub Actions step:

```yaml
- name: Run benchmark
  run: |
    cd benchmarks/apiserver
    make build
    ./run.sh --mode both --objects 100,1000 --scenarios none --output-dir ${{ runner.temp }}/bench-results
- name: Upload results
  uses: actions/upload-artifact@v4
  with:
    name: benchmark-results
    path: ${{ runner.temp }}/bench-results/
```
