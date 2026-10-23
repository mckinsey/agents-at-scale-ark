# Inline Tool Conflicting Policy Test

An authored inline Tool blocked by a conflicting NetworkPolicy reports Pending,
not Ready, and recovers once the conflict clears.

## What it tests
- **Honest Pending**: with a NetworkPolicy already widening the runner's
  egress, the Tool reports `state: Pending`, `Available: False` with reason
  `ConflictingNetworkPolicy`, and no resolved endpoint — so the dashboard never
  shows it as executable while the conflict exists.
- **Recovery**: deleting the conflicting NetworkPolicy lets the Tool reach
  `state: Ready` with `Available: True`.

This covers the "conflicting policy" reason for `Available=False` from task
7.2; it does not cover the dashboard-first case (a Tool authored before the
runtime is installed, reported Pending with reason `RuntimeNotInstalled`),
which is a separate scenario.

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run. Needs a
cluster with inline authoring and the activator enabled. Pinned to the watched
`default` namespace.

## Running
```bash
chainsaw test --test-dir inline-tool-conflicting-policy --selector inline-tools
```
