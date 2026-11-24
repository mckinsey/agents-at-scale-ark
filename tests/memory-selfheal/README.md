# Memory Self-Heal

Regression for [#2658](https://github.com/mckinsey/agents-at-scale-ark/issues/2658): a transient or not-yet-created Secret must not permanently strand a Memory in the error phase.

## What it tests
- A Memory whose address resolves from a missing Secret enters `error`, not a dead terminal state.
- Creating the Secret makes the Memory self-heal to `ready` with the resolved address, without editing or recreating it — exercising the live Secret watch and requeue wiring in the controller.

## Scope
ExecutionEngine shares the same fix, but its self-heal path is covered by controller (envtest) tests instead of here: an unresolvable address is rejected by its admission validation at create/update time, so the reconcile-time strand cannot be reproduced end-to-end without a transient fault injector.

## Running
```bash
chainsaw test
```

Successful completion validates that the Memory controller recovers automatically once a previously unresolvable Secret becomes available.
