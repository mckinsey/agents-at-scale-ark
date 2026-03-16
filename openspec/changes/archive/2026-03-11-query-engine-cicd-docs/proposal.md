## Why

The query engine binary and container image were added but the CI/CD pipeline doesn't build, scan, or deploy it. The Dockerfile uses a non-default name (`Dockerfile.query-engine`) which the existing `build-image` action doesn't support. Documentation doesn't reflect the new architecture where the controller delegates execution to a sidecar engine via A2A.

## What Changes

- Add `dockerfile` input to the `build-image` GitHub Action to support non-default Dockerfile names
- Add `ark-query-engine` to CI container build, security scan, and release deploy matrices
- Update E2E test setup to deploy the query engine sidecar (`queryEngine.enabled: true`)
- Add developer guide page for the query engine service
- Update architecture, query execution, deployment, and local development docs

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `.github/actions/build-image/action.yml` — add `dockerfile` input
- `.github/workflows/cicd.yaml` — add to build-containers and xray-container-scan matrices
- `.github/workflows/deploy.yml` — add to container deploy matrix
- `.github/actions/setup-e2e/action.yml` or E2E Helm values — enable query engine sidecar
- `docs/content/developer-guide/services/ark-query-engine.mdx` — new page
- `docs/content/reference/core-architecture.mdx` — update architecture diagram
- `docs/content/reference/query-execution.mdx` — update execution flow
- `docs/content/developer-guide/local-development.mdx` — devspace with engine pod
- `docs/content/operations-guide/deploying-ark.mdx` — Helm values
