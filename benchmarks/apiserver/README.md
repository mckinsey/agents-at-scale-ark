# Ark API Server Benchmark

Benchmarks Ark's Kubernetes API server (create, get, list, watch, delete).

## Quickstart

Requires a running cluster with Ark installed. See the [setup guide](../../docs/) or:

```bash
minikube start
devspace dev
```

Then:

```bash
make run    # benchmark at 100 objects → results-100.json
```

## Usage

```bash
./apiserver-bench -objects 100 -output results.json
./apiserver-bench -objects 1000 -concurrency 20 -output results-1000.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-objects` | `100` | Number of Query objects per run |
| `-concurrency` | `10` | Number of concurrent workers |
| `-namespace` | current context | Kubernetes namespace |
| `-kubeconfig` | `~/.kube/config` | Path to kubeconfig |
| `-output` | stdout | Path to write JSON results |

## Check Scripts

Scripts in `scripts/` validate benchmark results:

- **`calc-check-thresholds`** — check results against a scenario from `performance-thresholds.yaml`

## CI

The `Verification - Performance` workflow runs the benchmark and checks
thresholds from `docs/specs/performance/performance-thresholds.yaml`.
