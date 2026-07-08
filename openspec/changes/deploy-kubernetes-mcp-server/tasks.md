# Implementation Tasks

## 1. Production umbrella chart

- [x] Create `services/kubernetes-mcp-server/chart/` mirroring `services/argo-workflows/chart/`.
- [x] Write `Chart.yaml` (`apiVersion: v2`, `type: application`) declaring the upstream `kubernetes-mcp-server` `0.1.0` from repository `oci://ghcr.io/containers/charts` as a dependency.
- [x] Write `values.yaml` layering the Ark configuration from the merged devspace: `config.read_only: true`, `ingress.enabled: false`, `httpRoute.enabled: true` with a `parentRef` to the `localhost-gateway` Gateway in `ark-system`, and `rbac.create: true` with the `ark-reader` Role/RoleBinding granting `get`/`list`/`watch` on the `ark.mckinsey.com` resources (`agents`, `teams`, `queries`, `models`, `mcpservers`, `a2aservers`, `a2atasks`, `tools`, `memories`, `executionengines`, `arkconfigs`) and on the `argoproj.io` `workflows`/`workflowtemplates`.
- [x] Ship the Ark `MCPServer` registration (from PR #2536's `manifests/mcpserver.yaml`) as a chart template so a Helm install registers the server and discovers its `Tool` CRDs.
- [x] Verify the chart renders: `helm dependency build` then `helm template`/`helm lint` produce `config.read_only: true`, the namespace-scoped read-only RBAC, the `localhost-gateway` `HTTPRoute` with Ingress disabled, and the `MCPServer` resource.

## 2. Wire into the standard service install path

- [x] Add `services/kubernetes-mcp-server/manifest.yaml` declaring `dev`/`install`/`uninstall` support so `make services` offers the chart like every other optional service.
- [x] Add `services/kubernetes-mcp-server/build.mk` following the existing service `build.mk` pattern: define stamps and `kubernetes-mcp-server-install` / `-uninstall` / `-dev` targets that `helm upgrade --install` / `helm uninstall` the chart.
- [x] Add the chart to the `deploy` workflow chart matrix so it is packaged and pushed to the OCI chart registry alongside the other service charts.

## 3. Opt-in in devspace

- [x] In the root `devspace.yaml`, keep the `kubernetes-mcp-server` dependency commented out under `dependencies`.
- [x] Gate `kubernetes-mcp-server` behind an `ENABLE_KUBERNETES_MCP_SERVER` var (default `false`) wired through an `enable-kubernetes-mcp-server` profile that `op: add`s the dependency, mirroring how `argo-workflows` is opt-in via `ENABLE_ARGO`.
- [x] Confirm `devspace dev`/`deploy` do not deploy the server by default and do deploy it with `ENABLE_KUBERNETES_MCP_SERVER=true`. Verified statically: the base `dependencies` no longer include `kubernetes-mcp-server` and the `enable-kubernetes-mcp-server` profile is present.
- [x] Document that an operator can enable the deployment via `ENABLE_KUBERNETES_MCP_SERVER=true`, documented in `devspace.yaml`.

## 4. Register as an optional service in the ark CLI

- [x] Add a `kubernetes-mcp-server` entry to `tools/ark-cli/src/arkServices.ts` with `enabled: false`, pointing at the OCI chart registry, mirroring `localhost-gateway`.
- [x] Confirm the CLI typechecks, lints, and `arkServices.spec.ts` passes.
