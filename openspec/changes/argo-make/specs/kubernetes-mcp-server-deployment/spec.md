## ADDED Requirements

### Requirement: Production umbrella chart for kubernetes-mcp-server

The repo SHALL provide a `services/kubernetes-mcp-server/chart/` umbrella chart that mirrors the `services/argo-workflows/chart/` pattern, so the read-only `kubernetes-mcp-server` ships with a real Ark install and not only `devspace dev`. The chart's `Chart.yaml` SHALL declare the upstream `oci://ghcr.io/containers/charts/kubernetes-mcp-server` chart (version `0.1.0`) as a Helm dependency. The chart SHALL layer Ark-specific values matching the dev configuration: `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch`), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.

#### Scenario: Chart renders with read-only config
- **WHEN** the umbrella chart is rendered (helm template / lint)
- **THEN** it sets `config.read_only: true`, defines a namespace-scoped read-only `Role`/`RoleBinding` limited to `get`/`list`/`watch`, and enables the `localhost-gateway` `HTTPRoute` with Ingress disabled

#### Scenario: Upstream dependency declared
- **WHEN** the chart's `Chart.yaml` is inspected
- **THEN** it declares `kubernetes-mcp-server` version `0.1.0` from repository `oci://ghcr.io/containers/charts` as a dependency

### Requirement: Wired into the service install path

The chart SHALL be registered into the standard service install path via `manifest.yaml` and `build.mk`, so `make services` offers its install/uninstall/dev targets and the `deploy` workflow packages the chart and pushes it to the OCI chart registry alongside the other service charts.

#### Scenario: make services offers the chart
- **WHEN** an operator runs `make services`
- **THEN** the `kubernetes-mcp-server` chart is offered for install/uninstall/dev like every other optional service

#### Scenario: deploy workflow publishes the chart
- **WHEN** the `deploy` workflow runs
- **THEN** it packages the `kubernetes-mcp-server` chart and pushes it to the OCI chart registry next to the other service charts

### Requirement: MCPServer registration owned by the upstream change

This chart SHALL deploy only the server image and its Ark-specific values. The Ark `MCPServer` resource that registers the server with the cluster — and the `Tool` CRDs it discovers — SHALL be owned by the separate kubernetes-mcp-server change (PR #2536), which must land before this feature's grounding functions. This chart SHALL NOT duplicate that registration.

#### Scenario: No duplicate registration
- **WHEN** this chart is installed
- **THEN** it deploys the server that PR #2536's `MCPServer` registration targets, without shipping its own `MCPServer` resource

#### Scenario: Feature inert until upstream lands
- **WHEN** PR #2536 has not yet landed
- **THEN** the author Agent has no MCP `Tool` CRDs to ground through and the authoring grounding is inert
