# Events API Migration

Validates that controller events emitted via the `events.k8s.io/v1` API remain readable through the `core/v1` view that event consumers use.

## What it tests
- A Team's first reconcile emits a Normal `TeamCreated` event.
- The event is readable through the `core/v1` API (dual-serving) with `involvedObject`/`reason` populated.
- The event is returned by the `involvedObject.name` field selector that fark, ark-cli, and ark-api rely on.

## Running
```bash
chainsaw test
```

Successful completion confirms the migration from the deprecated `core/v1` event recorder to `events.k8s.io/v1` did not break the event-consumer contract.
