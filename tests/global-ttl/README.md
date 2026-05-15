# Global TTL Test

Tests the mutation webhook's handling of `spec.ttl` on Query resources based on the presence and content of `ArkConfig/default`.

## What it tests

- **Fallback TTL** — when no `ArkConfig` exists, a Query with no `spec.ttl` is defaulted to `720h`
- **Injected TTL** — when `ArkConfig.spec.queryTTL` is set, it is injected into Queries with no `spec.ttl`
- **Explicit TTL preserved** — a Query with an explicit `spec.ttl` keeps its value even when `ArkConfig` sets a different `queryTTL`

## Notes

`ArkConfig/default` is cluster-scoped, so this test runs with `concurrent: false` to avoid interfering with other tests that may also create or delete it.

The test is labeled `etcd-only` because the ArkConfig CRD is only installed in etcd mode. In postgresql mode, Ark resources are served by an aggregated API server which does not implement ArkConfig.

## Running

```bash
chainsaw test --include-test-regex global-ttl
```
