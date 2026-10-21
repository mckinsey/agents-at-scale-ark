# List resourceVersion semantics

Checks that list requests honour `resourceVersion` and `resourceVersionMatch` the way kube-apiserver does. The test has no label, so it runs against kube-apiserver on the etcd leg and against the aggregated PostgreSQL apiserver on the postgresql leg, with the same assertions.

## What it tests
- A future `resourceVersion` is rejected with `NotOlderThan`, with `Exact`, and with the legacy form that sets `limit` and no match.
- A `resourceVersion` the store has reached, and `resourceVersion=0`, return all three Models.
- A `resourceVersion` sent together with a `continue` token is a `400`.

Each future-version request runs in its own step with a 120s timeout, because kubectl retries a `504` that carries `Retry-After`.

## Running
```bash
chainsaw test --config tests/.chainsaw.yaml --test-dir tests/apiserver-list-resource-version
```

A pass means a client that asks for data at least as fresh as a given version is never served older data with a `200`.
