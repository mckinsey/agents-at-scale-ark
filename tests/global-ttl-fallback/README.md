# global-ttl-fallback

Verifies that when no `ArkConfig/default` exists, the mutating webhook falls back to the hardcoded 720h default for Queries without `spec.ttl`.

## What it tests
- Any pre-existing `ArkConfig/default` is deleted.
- A Query without `spec.ttl` is created.
- The stored Query has `spec.ttl: 720h0m0s` (the built-in fallback).

## Running
```bash
chainsaw test
```

Successful completion validates that the hardcoded fallback TTL is used when ArkConfig is absent.
