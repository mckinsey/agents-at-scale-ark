# Deploy kubernetes-mcp-server in production and enable it by default

## Why

PR #2536 (merged to `main`) wired the read-only `kubernetes-mcp-server` into the local `devspace dev` stack and added the Ark `MCPServer` registration that discovers its `resources_list` / `resources_get` `Tool` CRDs. That wiring is dev-only and opt-in: the server appears in the root `devspace.yaml` as a commented-out dependency, behind no enable flag and absent from the deploy/dev pipelines, with no production Helm path. Consumers that ground an Agent through these tools have no way to install the server in a real Ark deployment, and dev users must hand-uncomment it.

This change productionizes the deployment #2536 introduced and turns it on by default in devspace.

## What Changes

- Add a `services/kubernetes-mcp-server/chart/` umbrella chart mirroring `services/argo-workflows/chart/`. `Chart.yaml` declares the upstream `kubernetes-mcp-server` `0.1.0` from `oci://ghcr.io/containers/charts` as a dependency. `values.yaml` layers the same Ark configuration the merged devspace already uses: `config.read_only: true`, a namespace-scoped read-only `Role`/`RoleBinding` (`get`/`list`/`watch` on `ark.mckinsey.com` resources), and the `localhost-gateway` `HTTPRoute` with Ingress disabled.
- Ship the Ark `MCPServer` registration in the production chart, so a Helm install registers the server and discovers its `Tool` CRDs — matching what the merged per-service devspace deploys via `manifests/mcpserver.yaml`.
- Register the chart into the standard service install path via `manifest.yaml` + `build.mk`, so `make services` offers install/uninstall/dev and the `deploy` workflow packages the chart and pushes it to the OCI chart registry alongside the other service charts.
- Enable the service by default in the root `devspace.yaml`: uncomment the `kubernetes-mcp-server` dependency and wire it active into the `deploy` and `dev` pipelines so `devspace dev`/`deploy` bring it up by default, unlike `argo-workflows` which is opt-in via `ENABLE_ARGO`. An operator can still disable it, but the default is on.

## Impact

- New files: `services/kubernetes-mcp-server/chart/` (umbrella chart, values, `MCPServer` registration), `services/kubernetes-mcp-server/manifest.yaml`, `services/kubernetes-mcp-server/build.mk`.
- Modified: root `devspace.yaml` (dependency uncommented, pipelines wired default-on), the `deploy` workflow chart matrix.
- The server registers with Ark on install, exposing `resources_list` / `resources_get` `Tool` CRDs in the install namespace.
- This change productionizes and default-enables the deployment from PR #2536; it does not re-author the `MCPServer` registration content or the `Tool` discovery, which already exist on `main`.
