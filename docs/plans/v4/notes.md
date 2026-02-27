# Open Questions

## Team validation across engines

Drew proposes replacing `validateNoMixedTeam()` with capability matching via Agent Cards. The question: do we actually have a problem here?

As long as an agent can execute and return an A2A response, it can participate in a team. The team orchestrator just sends queries and gets text back. But the limitation might be conversation history — does something need to maintain a record of conversation across team members? If engine A doesn't persist history the same way engine B does, does the team orchestrator break?

Things to figure out:
- Is the current team orchestrator stateless enough that any A2A-responding agent works?
- Or does it assume history is managed in a specific way (e.g., controller-side memory)?
- If an engine manages its own sessions (Claude SDK with `--resume`), how does team history flow?
- Do we need Agent Cards for this, or is "can execute a query" sufficient for teams?

Not speccing this yet — need to look at the actual team orchestrator code.
