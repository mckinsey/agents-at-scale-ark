## Context

Ark's deployment story is GCP/GKE-first. The AWS terraform module under `infrastructure/providers/aws/` provisions a VPC and an EKS cluster and nothing else. Helm chart defaults match the local-development case (no SSL on Postgres, no annotations on ServiceAccounts, no namespace pins on half the services). The CLI assumes the kubectl context is already correct.

A spike validated the full path on 2026-05-12 in account `029422951777`, region `eu-north-1`: VPC plus EKS 1.33 auto-mode plus RDS Postgres 15.17 with `rds.logical_replication=1` and `rds.force_ssl=1`, IRSA roles for the controller and the apiserver (Secrets Manager read scoped to the DB password ARN), and ECR repositories. A Model, an Agent, and a Query roundtrip through the aggregated apiserver into RDS in 2.16 seconds. The end-to-end path works, but only after roughly ten manual workarounds.

The full strategic write-up, including phasing, ownership, and effort estimates, lives in `reference-plan.md` co-located with this change.

## Goals / Non-Goals

**Goals:**
- A clean AWS account can be provisioned and `ark install`-ed in two commands and under 25 minutes.
- The terraform module produces every input the CLI needs (cluster name, RDS endpoint and secret refs, IRSA role ARNs). The CLI consumes those outputs without further manual wiring.
- Chart defaults work on cloud-managed Postgres (SSL enforced) and cloud-managed Kubernetes (IRSA annotations through values).
- IRSA role-ARN annotations on ServiceAccounts survive `helm upgrade`.
- Release tags automatically publish charts, CLI, and container images.

**Non-Goals:**
- AgentCore A2A integration. Covered separately.
- Multi-cloud abstraction inside a single chart or installer. Cloud-specific behaviour goes behind a `--target <cloud>` flag, not into the default code path.
- AWS-native observability (CloudWatch, AMP, Grafana). Listed in the production add-ons phase but optional and separable.
- Multi-tenancy posture (one cluster per tenant vs namespace isolation). Tracked as an open question that should be answered before Phase 1 IRSA scoping ships.

## Decisions

### Decision: terraform module structured as `modules/{vpc,eks,rds,irsa,ecr}/`

The spike already sits in the modular shape. Each module owns its concern and exposes outputs the root composition wires together. The root `main.tf` is ~50 lines of module calls.

**Alternative considered:** keep the existing flat `infrastructure/providers/aws/` layout and add files. Rejected because the existing layout is bare and the modular shape is the upstream-worthy contribution.

### Decision: RDS module accepts a list of allowed security group IDs

EKS auto-mode attaches the AWS-managed cluster shared SG (`cluster_primary_security_group_id`) to node ENIs, not the module-created `node_security_group_id`. Anything granting "ingress from EKS nodes" using just the module's node SG silently times out. The RDS module takes `allowed_security_group_ids` as a list; the root composition passes both `cluster_primary_security_group_id` and `node_security_group_id`.

**Alternative considered:** open RDS to the full VPC CIDR. Rejected because it widens the blast radius unnecessarily; the list approach is the same SG-only model, just with the right SG inside it.

### Decision: ESO for the Secrets Manager to Kubernetes Secret bridge

Today the spike pulls the RDS password from Secrets Manager and applies a Kubernetes Secret by hand. ESO syncs the value continuously using IRSA-scoped Secrets Manager read. Password rotation in Secrets Manager flows into the cluster without operator intervention.

**Alternative considered:** AWS Secrets and Config Provider for Secrets Store CSI Driver. Rejected for now because ESO is more general (any backend, any cloud), and its CRD model fits the rest of the Ark resource shape. ESO can be replaced later if needed.

### Decision: `--target aws` profile rather than per-flag overrides

The CLI accepts `--target aws --terraform-outputs <path>` and reads cloud-specific defaults from a profile. The terraform-outputs JSON is a documented contract.

**Alternative considered:** add individual flags (`--ssl-mode`, `--postgres-host`, `--apiserver-role-arn`, etc.) and require the user to wire each one. Rejected because the surface grows quickly and the user has the same information in the terraform outputs already; the profile is the smaller surface.

**Alternative considered:** make the AWS defaults the global defaults (apply to all installs). Rejected because it breaks the local-minikube case; cloud and local have legitimately different needs.

### Decision: chart `serviceAccountAnnotations: {}` rendered in SA templates

Single PR pattern applied to all nine Ark charts. ServiceAccount templates render an `annotations:` block from `.Values.serviceAccountAnnotations`. The pattern works for IRSA on EKS, Workload Identity on GKE, Workload Identity on AKS, and the older in-cluster KIAM and kube2iam tools.

**Alternative considered:** ship the IRSA-annotated SA from terraform and have charts skip SA creation. Rejected because it splits ownership of the SA across two systems and breaks `helm uninstall` cleanup.

### Decision: terraform module published as subpath of the main repo

Reference as `git::https://github.com/mckinsey/agents-at-scale-ark.git//infrastructure/aws-stack?ref=v0.1.X`. Aligns with the Helm chart distribution model (versioned, downloadable, doesn't require cloning).

**Alternative considered:** publish to the Terraform Registry as a separate module. Rejected because it requires a separate registry account, separate release cadence, and a separate maintenance lifecycle. Subpath stays with the rest of Ark.

### Decision: auto-trigger Deploy workflow on release tag

`.github/workflows/deploy.yml` becomes a tag-push trigger with `deploy_helm_chart=true`, `deploy_to_npm=true`, `deploy_containers=true` set. Today these flags require a human to remember; `v0.1.63-rc.1` shows the consequence (tag and release exist, but the Deploy run was cancelled and nothing was published).

**Alternative considered:** keep manual dispatch and document the required flags. Rejected because manual is fragile and forgetting flags has already caused real artifact gaps.

### Decision: default `sslMode` in apiserver chart values changes from `disable` to `require`

Cloud-managed Postgres (RDS, Cloud SQL, Aiven, Azure) all require SSL. Local Postgres with SSL enabled works with `require`. Local Postgres without SSL set up can override to `disable`.

**Alternative considered:** detect the backend host and pick the default automatically. Rejected because chart values do not have access to runtime hostname classification; an explicit default is simpler and predictable.

## Risks / Trade-offs

- **Chart-level changes need code-owner approval.** `serviceAccountAnnotations` and the namespace fixes are small patches but they are behaviour changes for any existing user whose context-default-namespace was the install target. Documentation and a release note are required.
- **Terraform module versioning couples to the main repo cadence.** The subpath approach means a new Ark release also drops a new module version, even if the infrastructure side did not change. Acceptable trade-off for simpler maintenance.
- **EKS auto-mode behaviour is opaque.** The spike used `cluster_primary_security_group_id` as the canonical "node SG", but this is AWS-managed and may change. The terraform module documents the reasoning in a comment so future maintainers know why both SGs are passed.
- **The CLI `--target aws` profile is a new surface to maintain.** Each new cloud profile adds work. Mitigation: the profile is opt-in; the default install path is unchanged.
- **External-contributor velocity on the upstream repo.** Some of these PRs need upstream-maintainer review even when small. The recommended order in `reference-plan.md` puts the contributor-landable items first.

## Open Questions

- Should `--target aws` produce a sample `ExternalSecret` manifest, or render it inline as part of the install? The latter is cleaner UX but couples the CLI more tightly to ESO. (Lean: inline render, with a flag to skip.)
- Should the terraform module manage the `ark-system` namespace, or leave it to `ark install`? (Lean: leave to `ark install` so terraform stays cluster-shape-agnostic.)
- Multi-tenancy posture: one Ark cluster per tenant, or one cluster with namespace isolation? Affects whether IRSA roles are one-per-tenant or one-per-service. Should be answered before Phase 1 IRSA scoping ships.
- Image distribution: pull from `ghcr.io` directly (cross-region pull cost, ghcr egress dependency) or mirror to ECR (the spike provisions ECR but does not mirror)? Phase 1 acceptance should state which path ships.
- Egress posture: assume NAT-out-to-Internet (the spike's default), or build for a locked-down VPC with PrivateLink and VPC endpoints to OpenAI and Anthropic? Affects Phase 3 scope.
