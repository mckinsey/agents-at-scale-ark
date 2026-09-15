# Configuration Propagation

Validates that updating a ConfigMap reaches an MCPServer that resolves its
address from it.

## What it tests
- An MCPServer resolves `spec.address` from `configMapKeyRef` and reports the
  value in `status.resolvedAddress`
- Editing the configuration triggers a reconcile through the ConfigMap watch on
  the MCPServer controller, without waiting for the poll interval
- The new value is actually in effect: the server becomes `Available`, tool
  discovery runs against the new address, and the discovered Tool is `Ready`

Metadata-only edits are deliberately not covered here: `dataChangedPredicate`
drops them before a reconcile is enqueued, and proving that absence e2e would
mean waiting out a timeout. `helpers_test.go` covers it as a unit test.

## Why `pollInterval: 1h`

The MCPServer in `manifests/a02-mcpserver.yaml` sets `pollInterval: 1h`
deliberately. Every failure path in the controller requeues after the poll
interval, which defaults to `1m`, so with the default this test would pass on
the periodic requeue alone — even with the ConfigMap watch removed. With the
interval well past the assertion timeout, the only thing that can drive the
reconcile is the ConfigMap event. Do not lower it.

The first address is `http://wrong-address.invalid/mcp`: `.invalid` is reserved
by RFC 2606, so it fails DNS resolution immediately rather than hanging.

## Running
```bash
chainsaw test
```

Passing means a configuration change propagates to its consumers on the watch,
not on the poll.
