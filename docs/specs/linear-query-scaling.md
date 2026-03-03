# Linear Query Scaling

## Objective

Ark supports a simple deployment topology out of the box, without needing to
install databases or queues. Ark can be operated end-to-end using Kubernetes
standard primitives — resources — without non-Kubernetes APIs or additional
infrastructure components. This enables rapid onboarding, experimentation,
and learning using Kubernetes-native idioms. It is acceptable that traditional
`etcd` limitations are in place — for example that reconciliation of `Query`
resources will *not* scale linearly with volume or concurrency.

However, cluster operators should be able to deploy an additional component —
with a reference implementation in the marketplace — that enables near-linear
scaling of `Query` reconciliation with volume or concurrency.

In both cases, the end-to-end integration testing suite works identically,
showing that functional behaviour is the same regardless of storage backend.

We define a quantitative specification that states the minimum threshold for
near-linear scaling. Our build verifies this on a developer-like workstation. We
also verify on a single cloud environment at the moment, AWS.

Load tests MUST run against both a mock LLM and a real LLM configured
without rate limiting, so that we measure storage backend throughput with and 
without inference latency.

## Acceptance Criteria

### Stage 1 — Vanilla Ark Install

`ark install` deploys the default topology. The existing chainsaw E2E tests
(`!evaluated,!llm` selector) pass, confirming that the standard deployment
works correctly.

Verification: overnight, the performance test deploys the solution and chainsaw
tests pass.

**Status: Red** - there is no load test.

### Stage 2 — PostgreSQL Storage Backend Deployment

A cluster operator deploys the PostgreSQL storage backend from the marketplace.
The same chainsaw E2E tests (`!evaluated,!llm` selector) pass against this
topology, confirming identical functional behaviour.

Verification: TODO

**Status: Red** — not yet implemented.

### Stage 3 — Load Test: Vanilla Baseline

Run a load test against vanilla Ark (etcd storage backend). Establish baseline
throughput at increasing concurrency levels. This baseline demonstrates that
the default etcd storage backend does **not** exhibit linear scaling at higher
concurrency.

Verification: TODO

**Status: Red** — load test tooling not yet built.

### Stage 4 — Load Test: PostgreSQL Storage Backend — Developer Workstation

Run a load test against the PostgreSQL-backed cluster at increasing concurrency
levels (e.g. 1, 2, 4, 8 concurrent queries). Assert near-linear throughput
scaling within the threshold defined below.

**Status: Red** — load test tooling not yet built.

### Stage 5 — Load Test: PostgreSQL Storage Backend — AWS Environment

Run the same load test in an AWS environment with a more realistic topology.
Assert near-linear throughput scaling within the threshold defined below.

**Status: Red** — not yet planned.

### Stage 6 — Results Analysis

Compare results across storage backends and environments. Assert that the
PostgreSQL storage backend meets the scaling threshold. The vanilla baseline is
expected to plateau, confirming the scaling limitation that the PostgreSQL
storage backend addresses.

Verification: TODO

**Status: Red** — results analysis not yet built.

## Scaling Targets

Performance targets are defined in
[`performance/linear-query-scaling-targets.yaml`](performance/linear-query-scaling-targets.yaml).
Any change to that file triggers the performance test workflow on the PR.

The key target is the **scaling ratio**: the minimum ratio of actual throughput
increase to expected throughput increase when concurrency doubles. A ratio of
1.0 is perfect linear scaling. For example, if throughput at concurrency 2 is
`T₂` and at concurrency 4 is `T₄`, the scaling ratio is `T₄ / (2 × T₂)`.

## Background

Ark's default storage backend uses etcd via the Kubernetes API server. This
works well for moderate workloads but becomes a bottleneck under high
concurrency because all resource state mutations are serialized through a
single etcd cluster.

RFC [#636](https://github.com/mckinsey/agents-at-scale-ark/issues/636) proposed
PostgreSQL as an alternative storage backend to enable horizontal scaling.
PR [#937](https://github.com/mckinsey/agents-at-scale-ark/pull/937) delivered
the initial implementation. PRs
[#1167](https://github.com/mckinsey/agents-at-scale-ark/pull/1167) and
[#1188](https://github.com/mckinsey/agents-at-scale-ark/pull/1188) continue
this work. Issue [#747](https://github.com/mckinsey/agents-at-scale-ark/issues/747)
defines performance testing requirements. Issue
[#1219](https://github.com/mckinsey/agents-at-scale-ark/issues/1219) tracks
this epic.
