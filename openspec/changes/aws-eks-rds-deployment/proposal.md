## Why

Ark runs on AWS EKS + RDS Postgres today, but a spike on 2026-05-12 needed about ten manual workarounds to get the standard `ark install` path working. The upstream codebase grew up around minikube and GCP/GKE: Helm charts assume non-cloud defaults, the CLI does not know about IRSA, and the AWS terraform under `infrastructure/providers/aws/` is 92 lines and only provisions a VPC plus an EKS cluster. The proposal closes the gap so that any contributor can go from a clean AWS account to a working Ark cluster in two commands.

The spike that validated the end-to-end path lives at `infrastructure/aws-spike/`. End-to-end smoke (Model + Agent + Query through the aggregated apiserver and RDS) completed in 2.16 seconds.

## What Changes

Ten changes, grouped by area. Two are already in `main` from prior PRs (#2117 postgres install flow, #2132 apiserver readiness wait). The remaining eight are tracked in `tasks.md`.

- Infrastructure: extend `infrastructure/providers/aws/` with RDS, IRSA, and ECR modules. Fix the auto-mode security-group bug where `node_security_group_id` is not what auto-mode actually attaches to nodes.
- Charts: add `serviceAccountAnnotations` values key to controller and apiserver charts so IRSA role-ARN annotations can flow through values. Change apiserver chart `sslMode` default from `disable` to `require`. Parameterise the controller chart's hardcoded SA name and namespace.
- CLI: fix six services in `tools/ark-cli/src/arkServices.ts` that have no `namespace` key and land in whichever ns the kubectl context defaults to. Ship a default StorageClass option for PVC-using charts. Add an `--target aws` profile that consumes terraform outputs.
- Secrets: adopt external-secrets-operator for the Secrets-Manager-to-Kubernetes-Secret bridge that is manual today.
- Process: auto-trigger the Deploy workflow on `v*` release tags so chart, CLI, and container publishes do not depend on a human ticking three flags.
- Samples: audit four `samples/queries/*.yaml` files that use plural `spec.targets` against the apiserver's strict-decoding behaviour.

## Capabilities

### New Capabilities

- `aws-deployment-flow`: contributors can provision an EKS cluster, an RDS Postgres instance, IRSA roles, and ECR repositories with a single terraform module that produces every input `ark install` needs. The CLI consumes those outputs and installs the full Ark stack with IRSA annotations and SSL-enforced Postgres pre-wired.

### Modified Capabilities

- `helm-chart-deployment`: chart ServiceAccount templates support an `annotations` block configurable through values, so cloud-specific IAM bindings (EKS IRSA, GKE Workload Identity, AKS Workload Identity) work without `kubectl annotate` after install.
- `cli-install-flow`: `ark install` gains a `--target <cloud>` profile mechanism that reads cloud-specific defaults and a `--terraform-outputs` flag that consumes a JSON contract produced by the AWS terraform module.

## Impact

- `infrastructure/providers/aws/`: extended from 92 lines to a modular layout adding RDS, IRSA, ECR modules and the security-group fix.
- `infrastructure/aws-spike/`: the validated spike code, included for reviewer inspection. Slated to be folded into `infrastructure/providers/aws/` once the modular shape is agreed.
- `ark/dist/chart-apiserver/`: `values.yaml` default for `sslMode`, `serviceAccountAnnotations` rendering in `templates/serviceaccount.yaml`.
- `ark/dist/chart/`: same `serviceAccountAnnotations` work, plus parameterising the hardcoded SA name and namespace in `templates/rbac/service_account.yaml`.
- `tools/ark-cli/src/arkServices.ts`: add `namespace: ark-system` to `ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `noah`.
- `tools/ark-cli/src/commands/install/index.ts`: `--target aws` and `--terraform-outputs` flag handlers, ExternalSecret rendering option, default StorageClass option.
- `docs/content/operations-guide/provisioning.mdx`: AWS tab gains RDS, IRSA, ECR sections.
- `docs/content/operations-guide/postgres-storage-backend.mdx`: RDS minor-retirement caveat (spike hit `15.7 not found` in `eu-north-1`; check `aws rds describe-db-engine-versions` for the current floor).
- `.github/workflows/deploy.yml`: auto-fire on `v*` tag push with chart, npm, and container flags set.
- `samples/queries/`: audit `query-streaming.yaml`, `query-with-label-selectors.yaml`, `query-model.yaml`, `query-with-mcp-settings-in-annotations.yaml` against current Query schema (singular `target`).
- New: ExternalSecret rendering path for the RDS password bridge.

The full strategic plan including phasing, ownership, and effort estimates is in `reference-plan.md` in this change directory.
