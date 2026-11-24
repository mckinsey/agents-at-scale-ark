# Global Default Memory

Validates `ArkConfig/default.spec.defaultMemory` — the cluster-wide default Memory injected into `spec.memory` by the mutating webhook.

## What it tests
- A query created with no `spec.memory` in a namespace with **no** `Memory` keeps `spec.memory` unset, so the executor still degrades to a no-op store instead of failing
- A `Memory` that exists but never resolved an address (`serviceRef` to a missing Service, phase `error`) is **not** injected either. Existence alone is not enough: naming a `Memory` with no `status.lastResolvedAddress` makes `NewHTTPMemory` fail every query in the namespace
- Once a `Memory` with the configured name has resolved, the same query shape gets `spec.memory.name` written onto the resource at admission
- A query admitted before the `Memory` existed is **not** back-filled when it is later updated — `spec.memory` records what that query ran with
- An explicit `spec.memory` is never overwritten

The test is labelled `etcd-only` because the ArkConfig CRD is only installed in etcd mode. In postgresql mode, Ark resources are served by an aggregated API server which does not implement ArkConfig.

The ArkConfig sets `queryTTL` as well, and the first query asserts it. TTL is injected unconditionally from the same read, so a matching `spec.ttl` proves the ArkConfig had reached the webhook's cache — without it, an "assert `spec.memory` is unset" step would pass just as happily on a config the webhook had not seen yet.

Each `Memory` is asserted into its expected phase before the query that depends on it is created. The mutating webhook reads through the manager's cached client, so a query created in the same instant as its `Memory` could legitimately miss it; waiting for the controller to write status proves the shared cache has the object.

Every `Memory` here points somewhere unreachable, and the Query finalizer retries its broker message cleanup for a 5-minute grace period against a `Memory` it can still see. Each `Memory` is therefore deleted in its own step's `finally`, which runs when that step ends — a step `cleanup` runs at the end of the *test*, too late to protect the queries chainsaw tears down alongside it. The cluster-scoped `ArkConfig` is deleted from the `setup` step's `cleanup`, so it goes even when a later step fails.

The negative assertions use `set -eu`: without it a failing `kubectl` yields an empty string and the "spec.memory is unset" check passes for the wrong reason.

## Running
```bash
chainsaw test
```

Successful completion means memory resolution is recorded on the Query resource where a default is declared, and namespaces without a memory backend are left alone.
