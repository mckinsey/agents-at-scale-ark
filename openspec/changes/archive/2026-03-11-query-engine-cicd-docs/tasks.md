# Query Engine CI/CD and Docs — Tasks

## CI/CD

### 1. Add `dockerfile` input to build-image action
- In `.github/actions/build-image/action.yml`, add optional `dockerfile` input (default: `Dockerfile`)
- Pass it as `file` to `docker/build-push-action@v6`: `file: ${{ inputs.path }}/${{ inputs.dockerfile }}`

### 2. Add ark-query-engine to CI build matrix
- In `.github/workflows/cicd.yaml` `build-containers` job matrix, add:
  ```yaml
  - path: ark
    image: ark-query-engine
    dockerfile: Dockerfile.query-engine
  ```

### 3. Add ark-query-engine to security scan matrix
- In `.github/workflows/cicd.yaml` `xray-container-scan` job matrix, add `ark-query-engine`

### 4. Add ark-query-engine to deploy matrix
- In `.github/workflows/deploy.yml` container deploy matrix, add:
  ```yaml
  - path: ark
    image: ark-query-engine
    dockerfile: Dockerfile.query-engine
  ```

### 5. Enable query engine sidecar in E2E test deployment
- In the E2E Helm values (where ark-controller is deployed for tests), set `queryEngine.enabled: true`
- Set image repository and tag to the CI registry image built in step 2
- Verify E2E tests still pass with sidecar enabled

## Documentation

### 6. Create ark-query-engine service page
- New file: `docs/content/developer-guide/services/ark-query-engine.mdx`
- Sections: what it is, architecture (sidecar), A2A contract, Helm configuration, dev mode setup
- Follow the pattern of `docs/content/developer-guide/services/ark-broker.mdx`

### 7. Update core architecture docs
- In `docs/content/reference/core-architecture.mdx`, add query engine to the architecture diagram
- Show controller → A2A → engine → LLM flow

### 8. Update query execution docs
- In `docs/content/reference/query-execution.mdx`, update the execution flow
- Controller resolves target, sends A2A message to engine, engine executes, controller writes status

### 9. Update deployment docs
- In `docs/content/operations-guide/deploying-ark.mdx`, document `queryEngine` Helm values
- `queryEngine.enabled`, `queryEngine.container.image`, `queryEngine.container.port`, `queryEngine.container.resources`

### 10. Update local development docs
- In `docs/content/developer-guide/local-development.mdx`, document devspace with separate engine pod
- Explain `ark-query-engine-dev` chart, independent sync/restart, `--query-engine-addr` flag

## Success Criteria

- [x] `ark-query-engine` image built in CI on every PR
- [x] Security scan covers `ark-query-engine` image
- [x] Release pipeline builds and pushes `ark-query-engine` multi-arch image
- [x] E2E tests run with query engine sidecar enabled
- [x] Developer guide page exists for query engine
- [x] Architecture and query execution docs reflect engine separation
