# Mixed Team Execution

## Requirements

### MUST

- Existing single-engine teams continue to work with no changes
- Any mixed-team solution preserves team-level tracing and token usage aggregation
- `validateNoMixedTeam` behavior is documented (relaxed or replaced) before mixed teams are supported

### SHOULD

- Support per-member incremental migration (not all-at-once)
- Reuse existing `a2a_execution.go` plumbing for external member calls
- Type conversion at the team boundary is tested for fidelity (tool calls, system prompts, structured content)

### MAY

- Optimize same-engine members to run in-process even in mixed teams
- Support more than two executor types in a single team
