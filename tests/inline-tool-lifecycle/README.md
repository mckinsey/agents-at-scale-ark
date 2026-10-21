# Inline Tool Lifecycle Test

End-to-end lifecycle of a `type: inline` Tool on an inline-enabled cluster.

## What it tests
- **Create**: an authored inline Tool reaches `Ready`/`Available`, gets a
  resolved endpoint, and admission stamps the authorship annotations.
- **Provisioning**: the controller creates the full owned child set
  (Deployment, Service, ConfigMap, ServiceAccount, NetworkPolicy).
- **Idle**: a newly provisioned inline Tool keeps its runner scaled to zero,
  and the activator scales a warmed runner back down within the idle window
  after the call completes.
- **Attach**: an Agent referencing the inline tool becomes `Available`.
- **Call**: a `type: tool` Query returns the runner's output.
- **Edit**: changing the source reconciles the new generation and propagates to
  the source ConfigMap the runner reads on its next cold start.
- **Discover**: (after edit, not right after attach — see the known
  limitation below) a `type: agent` Query actually completes through the
  agent, not a direct `type: tool` call, which previously let this go
  untested.
- **Delete**: deleting the Tool cascades to every owned child.

## Known limitation
The `discover-via-agent` step proves the query routes through the Agent, but
not that the LLM actually invoked the inline tool via function-calling:
`mock-llm`'s SSE streaming path (`streaming.js`) reads
`choices[0].message.content` unconditionally before chunking it, which
crashes on a `tool_calls`-only message (no `content` field), and the
completions executor always requests streaming. There is currently no way to
script a real tool-calling round-trip against this mock-llm version. This
also affects other chainsaw tests that script a `tool_calls` mock-llm rule
(e.g. `agent-tools`, `jq-filter-test`) — tracked separately.

It also runs after `edit`, not right after `attach`: the original
`create -> call -> idle-scale-to-zero` sequence already races a
freshly-created Tool's `Available` status propagating to the executor's own
cache before the direct tool call validates it, and adding an extra
Agent+Query reconcile in between widened that race enough to flake the
`call` step with "inline Tool is not available for its current generation".

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run, because
inline authoring and the activator are off by default. This test needs a cluster
where:
- `inlineTools.enabled=true` and `inlineTools.activator.enabled=true`, and
- the controller watches the test namespace (`default`) — the activator refuses
  a cluster-wide binding, so the test pins to a watched namespace rather than a
  generated one.

Locally, `INLINE_TOOLS_RUNTIME=true devspace dev` provides such a cluster.

## Running
```bash
chainsaw test --test-dir inline-tool-lifecycle --selector inline-tools
```
