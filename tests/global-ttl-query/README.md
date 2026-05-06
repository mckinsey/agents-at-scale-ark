# global-ttl-query

Verifies that the mutating webhook injects `spec.ttl` from `ArkConfig/default.spec.queryTTL` when a Query is created without an explicit TTL.

## What it tests
- `ArkConfig/default` with `queryTTL: 1h` is created.
- A Query without `spec.ttl` is created.
- The stored Query has `spec.ttl: 1h0m0s` after the mutating webhook runs.

## Running
```bash
chainsaw test
```

Successful completion validates that the global TTL from ArkConfig is applied to Queries that omit their own TTL.
