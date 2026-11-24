# Cross-Namespace References

Checks that an Agent `modelRef` or a Query `memory` naming another namespace needs an opt-in on the target.

## What it tests
- Agent and Query referencing a Model or Memory in another namespace are rejected when the target has no `ark.mckinsey.com/allowed-namespaces` annotation
- The rejection message is the same when the target does not exist
- A Model listing the source namespace can be used, and the query completes
- A Memory annotated with `*` is accepted
- Removing the annotation makes the executor fail the next query that uses the reference

## Running
```bash
chainsaw test
```

Successful completion shows that cross-namespace Model and Memory references work only when the target opts in.
