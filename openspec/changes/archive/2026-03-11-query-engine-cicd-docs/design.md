## Context

The query engine is built from `ark/Dockerfile.query-engine` in the same Go module as the controller. The existing `build-image` action assumes `Dockerfile` in the build context directory. All other services follow this convention. The query engine is the first case where two images are built from the same directory with different Dockerfiles.

## Goals / Non-Goals

**Goals:**
- CI builds and pushes `ark-query-engine` image on every PR and release
- Security scanning covers the new image
- E2E tests run with the sidecar enabled
- Docs describe the query engine architecture, configuration, and dev workflow

**Non-Goals:**
- Changing the query engine implementation
- Adding new E2E tests specific to the engine (existing chainsaw tests cover it)

## Decisions

### 1. Add `dockerfile` input to build-image action

The `docker/build-push-action@v6` supports a `file` parameter. Add an optional `dockerfile` input to `.github/actions/build-image/action.yml` that defaults to `Dockerfile`. The query engine matrix entry uses `dockerfile: Dockerfile.query-engine`.

```yaml
# cicd.yaml matrix entry
- path: ark
  image: ark-query-engine
  dockerfile: Dockerfile.query-engine
```

This avoids restructuring the Dockerfile into a separate directory.

### 2. E2E test deployment

The `setup-e2e` action deploys the controller via Helm. The sidecar is gated by `queryEngine.enabled`. In CI, this needs to be `true` and the image must be available in the CI registry.

The E2E Helm values should set:
```yaml
queryEngine:
  enabled: true
  container:
    image:
      repository: <ci-registry>/ark-query-engine
      tag: <sha>
```

### 3. Documentation structure

New page at `developer-guide/services/ark-query-engine.mdx` following the pattern of `ark-broker.mdx`. Updates to existing pages are minimal — add the engine to architecture diagrams and mention the `--query-engine-addr` flag.

## Risks / Trade-offs

- [E2E image availability] The query engine image must be built before E2E tests run. The existing `build-containers` job already runs before E2E jobs, so this is handled by the existing dependency chain.
- [Two images from one context] The `path: ark` context is shared between `ark-controller` and `ark-query-engine`. Docker layer caching is per-image, so they don't interfere. Build time increases slightly since two images are built from the same context.
