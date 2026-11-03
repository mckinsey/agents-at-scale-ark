# Completions Engine

Executes queries against agents, teams, models, and tools using the completions message format. Communicates with the Ark controller via A2A protocol.

## Quickstart

```bash
make help

make build-completions
make build-completions-container

# Run locally (requires K8s cluster access)
go run cmd/completions/main.go --addr=:9090
```

## Chart values

The Helm chart is in `chart/`. Values that set the executor's scope:

- `rbac.create` (default `true`): creates the RBAC for the chart's ServiceAccount. For the central install in `ark-system` only, set `false` together with `serviceAccount.create=false` to reuse the `ark-controller` ServiceAccount and its RBAC.
- `namespaceScopedDiscovery` (default `false`): `false` binds a ClusterRole that reads Secrets, ConfigMaps, and Services in every namespace. `true` binds a Role in the release namespace instead and limits discovery to that namespace, for a per-tenant install.
- `executionEngine.create` (default `false`): creates the `ark-completions` ExecutionEngine that routes the namespace's queries to this install.

See [Per-tenant completions executor](../../../docs/content/operations-guide/tenant-namespace-management.mdx#per-tenant-completions-executor).
