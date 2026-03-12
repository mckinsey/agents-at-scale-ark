## 1. Standalone Production Helm Chart

- [x] 1.1 Create `ark/executors/completions/chart/Chart.yaml` with proper metadata and version
- [x] 1.2 Create `ark/executors/completions/chart/values.yaml` with image, port, resources, serviceAccount config
- [x] 1.3 Create `ark/executors/completions/chart/templates/deployment.yaml` — standalone Deployment with health probes, OTEL env, resource limits
- [x] 1.4 Create `ark/executors/completions/chart/templates/service.yaml` — ClusterIP service on port 9090
- [x] 1.5 Create `ark/executors/completions/chart/templates/serviceaccount.yaml` — reference ark-controller SA or create own
- [x] 1.6 Remove `charts/ark-completions-dev/` (replaced by production chart)

## 2. Remove Sidecar from Controller Chart

- [x] 2.1 Remove completions sidecar container block from `ark/dist/chart/templates/manager/manager.yaml`
- [x] 2.2 Add `--completions-addr` to controller args in `manager.yaml`, value from `completions.addr` in values
- [x] 2.3 Update `ark/dist/chart/values.yaml` — replace `completions.container.*` with `completions.addr` pointing to `http://ark-completions.ark-system:9090`
- [x] 2.4 Change default `--completions-addr` in `ark/cmd/main.go` from `http://localhost:9090` to `http://ark-completions.ark-system:9090`

## 3. ark-cli Integration

- [x] 3.1 Add `ark-completions` service entry to `tools/ark-cli/src/arkServices.ts` as `core` category with chart path, namespace, deployment name
- [x] 3.2 Ensure install ordering — ark-completions installs after ark-controller (dependency on SA)
- [x] 3.3 Verify `ark install` and `ark status` work with the new service

## 4. DevSpace Alignment

- [x] 4.1 Update `ark/devspace.yaml` to use chart path (`ark/executors/completions/chart`) instead of dev chart
- [x] 4.2 Verify `devspace dev` deploys completions as standalone with correct image overrides

## 5. CI/CD Updates

- [x] 5.1 Add `ark-completions` chart to build-charts matrix in `.github/workflows/cicd.yaml`
- [x] 5.2 Verify e2e setup scripts use standalone deployment
- [x] 5.3 Verify chart lint/package passes for the new chart

## 6. Documentation Updates

- [x] 6.1 Rename `docs/content/developer-guide/services/ark-query-engine.mdx` to `ark-completions.mdx`
- [x] 6.2 Update `docs/content/reference/core-architecture.mdx`
- [x] 6.3 Update `docs/content/reference/query-execution.mdx`
- [x] 6.4 Update `docs/content/developer-guide/local-development.mdx`
- [x] 6.5 Update `docs/content/operations-guide/deploying-ark.mdx`
- [x] 6.6 Update `docs/content/developer-guide/services.mdx`
- [x] 6.7 Update `docs/content/user-guide/samples/teams/team-strategies.mdx`

## Success Criteria

- [x] `ark/executors/completions/chart/` exists as a production Helm chart
- [x] Controller chart has no sidecar — completions is a separate Deployment
- [x] `ark install` installs completions as a core service
- [x] `ark status` shows completions engine health
- [x] Dev and prod use the same topology (standalone pod + K8s service)
- [x] All docs reference "completions engine" not "query engine"
- [x] CI/CD builds and publishes the chart
- [x] All e2e tests pass
