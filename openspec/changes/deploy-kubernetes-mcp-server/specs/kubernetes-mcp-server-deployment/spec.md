## ADDED Requirements

### Requirement: Production umbrella chart for kubernetes-mcp-server

The repo SHALL provide a `services/kubernetes-mcp-server/chart/` umbrella chart that mirrors the `services/argo-workflows/chart/` pattern, so the read-only `kubernetes-mcp-server` ships with a real Ark install and not only `devspace dev`. The chart's `Chart.yaml` SHALL declare the upstream `kubernetes-mcp-server` chart (version `0.1.0`) from repository `oci://ghcr.io/containers/charts` as a Helm dependency. The chart SHALL layer the Ark-specific values that the merged devspace deployment (PR #2536) already uses: `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch` on the `ark.mckinsey.com` resources), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.

#### Scenario: Chart renders with read-only config
- **WHEN** the umbrella chart is rendered (helm template / lint)
- **THEN** it sets `config.read_only: true`
- **AND** it defines a namespace-scoped read-only `Role`/`RoleBinding` limited to `get`/`list`/`watch`
- **AND** it enables the `localhost-gateway` `HTTPRoute` with Ingress disabled

#### Scenario: Upstream dependency declared
- **WHEN** the chart's `Chart.yaml` is inspected
- **THEN** it declares `kubernetes-mcp-server` version `0.1.0` from repository `oci://ghcr.io/containers/charts` as a dependency

### Requirement: Production chart ships the MCPServer registration

The production chart SHALL ship the Ark `MCPServer` registration so a Helm install registers the server with the cluster and its `Tool` CRDs (`resources_list`, `resources_get`) are discovered — matching what the merged per-service devspace deploys via `manifests/mcpserver.yaml` (PR #2536). The registration content is owned by PR #2536, which is already merged to `main`; this chart productionizes that registration rather than re-authoring it.

#### Scenario: Helm install registers the server
- **WHEN** the chart is installed into a namespace
- **THEN** it creates an Ark `MCPServer` resource targeting the in-cluster `kubernetes-mcp-server` service over the `http` transport
- **AND** the registration discovers the server's `resources_list` and `resources_get` `Tool` CRDs in that namespace

#### Scenario: Registration matches the merged devspace
- **WHEN** the chart's `MCPServer` resource is compared with PR #2536's `manifests/mcpserver.yaml`
- **THEN** it registers the same server (name, transport, in-cluster address) without re-authoring the registration content

### Requirement: Wired into the service install path

The chart SHALL be registered into the standard service install path via `manifest.yaml` and `build.mk`, so `make services` offers its install/uninstall/dev targets and the `deploy` workflow packages the chart and pushes it to the OCI chart registry alongside the other service charts.

#### Scenario: make services offers the chart
- **WHEN** an operator runs `make services`
- **THEN** the `kubernetes-mcp-server` chart is offered for install/uninstall/dev like every other optional service

#### Scenario: deploy workflow publishes the chart
- **WHEN** the `deploy` workflow runs
- **THEN** it packages the `kubernetes-mcp-server` chart and pushes it to the OCI chart registry next to the other service charts

### Requirement: Enabled by default in devspace

The root `devspace.yaml` SHALL deploy `kubernetes-mcp-server` by default. The `kubernetes-mcp-server` dependency SHALL be uncommented and active, and wired into the `deploy` and `dev` pipelines so `devspace dev`/`deploy` bring the server up by default — unlike `argo-workflows`, which is opt-in via `ENABLE_ARGO`. An operator MAY disable the deployment, but the default SHALL be on.

#### Scenario: devspace dev brings up the server by default
- **WHEN** an operator runs `devspace dev` with no extra flags or environment variables
- **THEN** the `kubernetes-mcp-server` is deployed
- **AND** its `MCPServer` registration produces the `resources_list` / `resources_get` `Tool` CRDs

#### Scenario: devspace deploy brings up the server by default
- **WHEN** an operator runs `devspace deploy` with no extra flags or environment variables
- **THEN** the `kubernetes-mcp-server` is deployed by default

#### Scenario: Operator can disable the default-on deployment
- **WHEN** an operator chooses to disable the `kubernetes-mcp-server`
- **THEN** they can do so explicitly
- **AND** the absence of any such opt-out still results in the server being deployed
