# Kubernetes Events

Validates the contract between controller-emitted Kubernetes Events and the consumers that read them (fark, ark-cli, ark-api): events must be readable through the `core/v1` API and by the `involvedObject.name` field selector.

## What it tests
- A controller reconcile that emits an event (a Team's first reconcile emits a Normal `TeamCreated` event) produces a Kubernetes Event.
- The event is readable through the `core/v1` API with `involvedObject`/`reason` populated.
- The event is returned by the `involvedObject.name` field selector consumers rely on.

## Running
```bash
chainsaw test
```

Successful completion confirms the controller → Kubernetes Event → consumer read path stays intact, regardless of how events are emitted under the hood.
