# global-ttl-override

Verifies that an explicit `spec.ttl` on a Query is preserved by the mutating webhook even when `ArkConfig/default.spec.queryTTL` is set.

## What it tests
- `ArkConfig/default` with `queryTTL: 1h` is created.
- A Query with explicit `spec.ttl: 5m` is created.
- The stored Query has `spec.ttl: 5m0s` (the user's value, not the global default).

## Running
```bash
chainsaw test
```

Successful completion validates that user-specified TTL always wins over the ArkConfig default.
