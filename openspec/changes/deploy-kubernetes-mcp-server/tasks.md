# Implementation Tasks

## 1. Production umbrella chart

- [ ] Create `services/kubernetes-mcp-server/chart/` mirroring `services/argo-workflows/chart/`.
- [ ] Write `Chart.yaml` (`apiVersion: v2`, `type: application`) declaring the upstream `kubernetes-mcp-server` `0.1.0` from repository `oci://ghcr.io/containers/charts` as a dependency.
- [ ] Write `values.yaml` layering the Ark configuration from the merged devspace: `config.read_only: true`, `ingress.enabled: false`, `httpRoute.enabled: true` with a `parentRef` to the `localhost-gateway` Gateway in `ark-system`, and `rbac.create: true` with the `ark-reader` Role/RoleBinding granting `get`/`list`/`watch` on the `ark.mckinsey.com` resources (`agents`, `teams`, `queries`, `models`, `mcpservers`, `a2aservers`, `a2atasks`, `tools`, `memories`, `executionengines`, `arkconfigs`).
- [ ] Ship the Ark `MCPServer` registration (from PR #2536's `manifests/mcpserver.yaml`) as a chart template so a Helm install registers the server and discovers its `Tool` CRDs.
- [ ] Verify the chart renders: `helm dependency build` then `helm template`/`helm lint` produce `config.read_only: true`, the namespace-scoped read-only RBAC, the `localhost-gateway` `HTTPRoute` with Ingress disabled, and the `MCPServer` resource.

## 2. Wire into the standard service install path

- [ ] Add `services/kubernetes-mcp-server/manifest.yaml` declaring `dev`/`install`/`uninstall` support so `make services` offers the chart like every other optional service.
- [ ] Add `services/kubernetes-mcp-server/build.mk` following the existing service `build.mk` pattern: define stamps and `kubernetes-mcp-server-install` / `-uninstall` / `-dev` targets that `helm upgrade --install` / `helm uninstall` the chart.
- [ ] Add the chart to the `deploy` workflow chart matrix so it is packaged and pushed to the OCI chart registry alongside the other service charts.

## 3. Enable by default in devspace

- [ ] In the root `devspace.yaml`, uncomment the `kubernetes-mcp-server` dependency under `dependencies`.
- [ ] Wire `kubernetes-mcp-server` active into the `deploy` and `dev` pipelines so `devspace dev`/`deploy` bring it up by default (default on, not gated behind an `ENABLE_` flag like `argo-workflows`).
- [ ] Confirm `devspace dev` and `devspace deploy` deploy the server by default and that the `MCPServer` registration produces the `resources_list` / `resources_get` `Tool` CRDs.
- [ ] Document that an operator can disable the default-on deployment.
