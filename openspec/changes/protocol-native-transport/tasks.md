# Protocol-Native Transport Tasks (Umbrella)

This is the umbrella change set. Implementation tasks live in their owning child change sets. This file tracks stage sequencing, dependency order, and cross-references only.

## Stage order and ownership

| Step | Change set | Depends on | 
| --- | --- | --- |
| 1 | [`extension-isolation-architecture`](../extension-isolation-architecture/tasks.md) | — |
| 2 | [`controller-input-decoupling`](../controller-input-decoupling/tasks.md) | 1 |
| 3 | [`controller-response-boundary`](../controller-response-boundary/tasks.md) | 1 |
| 4 | [`query-input-api-normalization`](../query-input-api-normalization/tasks.md) | 1, 2 |
| 5 | [`protocol-stream-contract`](../protocol-stream-contract/tasks.md) | 1 |
| 6 | [`agent-team-protocol-messages`](../agent-team-protocol-messages/tasks.md) | 1, 2, 4 |
| 7 | [`memory-protocol-messages`](../memory-protocol-messages/tasks.md) | 6 |
| 8 | [`handler-protocol-boundary`](../handler-protocol-boundary/tasks.md) | 6, 7 |
| 9 | [`compat-lifecycle-management`](../compat-lifecycle-management/tasks.md) | Ongoing |

## Parallelism

- Step 1 merges first (foundation, no behavioral change).
- Steps 2 and 3 can run in parallel after Step 1.
- Steps 4 and 5 can run in parallel after Steps 2/3.
- Steps 6, 7, 8 are sequential.
- Step 9 is ongoing alongside all steps.

## Cross-cutting concern ownership

| Concern | Primary owner | Integration points |
| --- | --- | --- |
| Extension interface + registry | `extension-isolation-architecture` (Step 1) | Controller (Step 3), handler (Step 8), capability verifier (Step 3) |
| Team attribution schema | `extension-isolation-architecture` (Step 1, task 3) | `agent-team-protocol-messages` (Step 6, task 6) for usage contract |
| Capability verification (`soft_fail_warn`) | `extension-isolation-architecture` (Step 1, task 4) for registry foundation; `controller-response-boundary` (Step 3, tasks 7.1-7.3) for controller integration | `compat-lifecycle-management` (Step 9, tasks 6.1-6.3 + 7.4) for governance signals and escalation |
| Parity tests + mixed deployment + retirement | `compat-lifecycle-management` (Step 9) | All steps contribute adapters; Step 9 owns inventory and governance |
| Extension inventory guardrail | `compat-lifecycle-management` (Step 9, task 6.3) | `extension-isolation-architecture` (task 7.1) for `ExecutionContextExtensionURI` disposition |
| Native-first extension admission | `extension-isolation-architecture` design decisions | All steps follow native-first filter |
