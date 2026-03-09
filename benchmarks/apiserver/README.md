# Ark API Server Benchmark

Benchmarks Ark's Kubernetes API server at multiple concurrency levels and checks scaling ratios.

## Quickstart

Requires a running cluster with Ark installed. See the [setup guide](../../docs/) or:

```bash
minikube start
devspace dev
```

Then:

```bash
make run    # benchmark at concurrency 1, 2, 4 → results.json
make gate   # check results against targets
```

## Tools

**`apiserver-bench`** — runs CRUD+watch benchmarks against the Ark API.

```bash
./apiserver-bench -concurrency 1,2,4 -objects 100 -output results.json
```

| Flag | Default | Description |
|------|---------|-------------|
| `-concurrency` | `10` | Concurrency level(s), comma-separated (e.g. `1,2,4`) |
| `-objects` | `100` | Number of Query objects per run |
| `-namespace` | current context | Kubernetes namespace |
| `-kubeconfig` | `~/.kube/config` | Path to kubeconfig |
| `-output` | stdout | Path to write JSON results |

**`benchmark-gate`** — checks results against targets.

```bash
./benchmark-gate -results results.json -targets targets.default.yaml
```

Exits 0 if all gates pass, 1 if any fail.

## Targets

One YAML file defines both per-operation thresholds and scaling ratio targets:

```yaml
concurrency_levels: [1, 2, 4]
scaling_ratio_min: 0.8
operations:
  create:
    max_error_rate: 0.01
    max_p99_ms: 500
    min_throughput: 50
```

`targets.default.yaml` ships with relaxed values for local dev. The authoritative targets live in `docs/specs/performance/linear-query-scaling-targets.yaml` and are used in CI.
