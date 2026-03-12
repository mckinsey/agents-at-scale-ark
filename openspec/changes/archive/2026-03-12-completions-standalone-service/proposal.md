## Why

The completions engine was extracted from genai into `executors/completions/` but still deploys as a sidecar in the controller pod for production. This creates a topology mismatch — devspace deploys it standalone while prod embeds it as a sidecar. The engine can't scale independently, ark-cli doesn't know it exists, and the architecture doesn't match the "first-class service" intent or the future vision of multiple executors (responses, langchain).

## What Changes

- Standalone production Helm chart for ark-completions (separate Deployment + Service)
- Remove sidecar container from the controller's manager.yaml
- Controller passes `--completions-addr` pointing to the K8s service instead of localhost
- ark-cli registers ark-completions as a core service for install/status
- Documentation updated across 7 files to reflect new naming, architecture, and helm values
- Dev and prod topologies aligned — both use standalone deployment with K8s service

## Capabilities

### New Capabilities
- `standalone-completions-chart`: Production Helm chart for ark-completions as an independent Deployment + Service in ark-system
- `ark-cli-completions`: ark-cli awareness of completions engine for install and status commands
- `completions-docs`: Documentation updates replacing query-engine references and reflecting standalone architecture

### Modified Capabilities

## Impact

- `ark/dist/chart/templates/manager/manager.yaml` — remove completions sidecar container
- `ark/dist/chart/values.yaml` — update completions config to reference K8s service
- `ark/executors/completions/chart/` — new production chart (promote from dev chart)
- `tools/ark-cli/src/arkServices.ts` — add ark-completions service entry
- `ark/cmd/main.go` — change default `--completions-addr` from localhost to K8s service
- `.github/` — CI/CD updates for chart builds
- `docs/content/` — 7 files: ark-query-engine.mdx rename, core-architecture, query-execution, local-development, deploying-ark, services, team-strategies
