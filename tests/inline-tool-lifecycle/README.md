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
- **Attach/discover**: an Agent referencing the inline tool becomes `Available`.
- **Call**: a `type: tool` Query returns the runner's output.
- **Edit**: changing the source reconciles the new generation and propagates to
  the source ConfigMap the runner reads on its next cold start.
- **Delete**: deleting the Tool cascades to every owned child.

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
