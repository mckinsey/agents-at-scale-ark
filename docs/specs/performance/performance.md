# Performance

## Overview

Ark's API server performance is verified by automated benchmarks that run
against each storage backend. The `Verification - Performance` workflow installs
Ark, runs benchmarks, and checks thresholds on every change to the spec or
benchmark code.

Thresholds are defined in
[`performance-thresholds.yaml`](performance-thresholds.yaml).

## Acceptance Criteria

### Vanilla Ark Install (etcd)

Install a single-controller Ark cluster using the default storage backend
(etcd). This is the standard `helm install` — no additional infrastructure
required. Run the apiserver benchmark: create 100 Query resources with 10
concurrent workers. Assert zero errors and p99 latency under 200ms.

### PostgreSQL Storage Backend Install

Starting from a vanilla Ark cluster, deploy the PostgreSQL storage backend.
This requires a maximum of:

1. One `helm install` command (the PostgreSQL storage chart from the marketplace)
2. One additional command (restart or reconfigure the controller)

The same chainsaw E2E tests (`!evaluated,!llm` selector) must pass against this
topology, confirming identical functional behaviour regardless of backend.

Then run the same apiserver benchmark: create 100 Query resources with 10
concurrent workers. Assert zero errors and p99 latency under 200ms.

### Thresholds

| Scenario | Backend | Objects | Concurrency | Max Errors | Max p99 |
|----------|---------|---------|-------------|------------|---------|
| `etcd-baseline-query-creation` | etcd | 100 | 10 | 0 | 200ms |
| `postgresql-baseline-query-creation` | postgresql | 100 | 10 | 0 | 200ms |

## Future: Linear Query Scaling

The current benchmarks verify that both backends work correctly at moderate
volume. The next phase will verify that query create throughput scales linearly
with volume on the PostgreSQL backend.

Ark's default etcd backend serializes all mutations through a single etcd
cluster, which plateaus under high volume. The PostgreSQL backend is expected
to maintain constant throughput as object count increases from 100 to 1000+.

The acceptance criterion will be a scaling ratio ≥ 0.8, defined as
`throughput_at_N / throughput_at_100`. This will extend the thresholds file
with additional scenarios when ready.

## Background

Ark's default storage backend uses etcd via the Kubernetes API server. This
works well for moderate workloads but becomes a bottleneck under high volume
because all resource state mutations are serialized through a single etcd
cluster.

RFC [#636](https://github.com/mckinsey/agents-at-scale-ark/issues/636) proposed
PostgreSQL as an alternative storage backend. PR
[#937](https://github.com/mckinsey/agents-at-scale-ark/pull/937) delivered the
initial implementation. Issue
[#1219](https://github.com/mckinsey/agents-at-scale-ark/issues/1219) tracks the
performance epic.
