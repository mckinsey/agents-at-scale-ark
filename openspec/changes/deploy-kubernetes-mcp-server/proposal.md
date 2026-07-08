# Deploy kubernetes-mcp-server in production as an optional component

## Why

PR #2536 (merged to `main`) wired the read-only `kubernetes-mcp-server` into the local `devspace dev` stack and added the Ark `MCPServer` registration that discovers its `resources_list` / `resources_get` `Tool` CRDs. That wiring is dev-only and opt-in: the server appears in the root `devspace.yaml` as a commented-out dependency, behind no enable flag and absent from the deploy/dev pipelines, with no production Helm path. Consumers that ground an Agent through these tools have no way to install the server in a real Ark deployment, and dev users must hand-uncomment it.

This change productionizes the deployment #2536 introduced and ships it as an optional, opt-in component across the Helm chart, the ark CLI, and devspace.

## What Changes

- Add a `services/kubernetes-mcp-server/chart/` umbrella chart mirroring `services/argo-workflows/chart/`. `Chart.yaml` declares the upstream `kubernetes-mcp-server` `0.1.0` from `oci://ghcr.io/containers/charts` as a dependency. `values.yaml` layers the same Ark configuration the merged devspace already uses: `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch` on `ark.mckinsey.com` resources and on the `argoproj.io` `workflows`/`workflowtemplates`), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.
- Ship the Ark `MCPServer` registration in the production chart, so a Helm install registers the server and discovers its `Tool` CRDs — matching what the merged per-service devspace deploys via `manifests/mcpserver.yaml`.
- Register the chart into the standard service install path via `manifest.yaml` + `build.mk`, so `make services` offers install/uninstall/dev and the `deploy` workflow packages the chart and pushes it to the OCI chart registry alongside the other service charts.
- Register the chart in the ark CLI (`arkServices.ts`) as a known service that is disabled by default, so the CLI is aware of it and operators can opt in via config override, matching how `localhost-gateway` is handled.
- Keep the service opt-in in the root `devspace.yaml`: leave the `kubernetes-mcp-server` dependency commented out and gate it behind an `ENABLE_KUBERNETES_MCP_SERVER` flag (default `false`) wired through an `enable-kubernetes-mcp-server` profile, mirroring how `argo-workflows` is opt-in via `ENABLE_ARGO`. Operators enable it with `ENABLE_KUBERNETES_MCP_SERVER=true`.

## Impact

- New files: `services/kubernetes-mcp-server/chart/` (umbrella chart, values, `MCPServer` registration), `services/kubernetes-mcp-server/manifest.yaml`, `services/kubernetes-mcp-server/build.mk`.
- Modified: root `devspace.yaml` (dependency gated behind `ENABLE_KUBERNETES_MCP_SERVER`, default off, via an `enable-kubernetes-mcp-server` profile), `tools/ark-cli/src/arkServices.ts` (chart registered, disabled by default), the `deploy` workflow chart matrix.
- The server registers with Ark on install, exposing `resources_list` / `resources_get` `Tool` CRDs in the install namespace.
- This change productionizes the deployment from PR #2536 as an optional component; it does not re-author the `MCPServer` registration content or the `Tool` discovery, which already exist on `main`.
