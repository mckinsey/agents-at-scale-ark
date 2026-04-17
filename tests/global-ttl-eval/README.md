# global-ttl-eval

Verifies that the mutating webhook injects `spec.ttl` from `ArkConfig/default.spec.evaluationTTL` when an Evaluation is created without an explicit TTL.

## What it tests
- `ArkConfig/default` with `evaluationTTL: 3h` is created.
- An Evaluation without `spec.ttl` is created.
- The stored Evaluation has `spec.ttl: 3h0m0s` after the mutating webhook runs.

## Running
```bash
chainsaw test
```

Requires the Evaluation CRD to be installed in the cluster. Successful completion validates that the global TTL from ArkConfig is applied to Evaluations that omit their own TTL.
