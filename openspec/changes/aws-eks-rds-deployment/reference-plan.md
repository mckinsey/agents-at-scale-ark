# Ark on AWS: deployment plan (EKS + RDS)

Last updated: 2026-05-14. Companion files: `aws-spike/NOTES.md` (validation log) and `aws-spike/FOLLOWUP.md` (line-item backlog).

## Glossary

- **Ark**: the agents-at-scale platform, repo `mckinsey/agents-at-scale-ark`. "Upstream" in this document means that repo.
- **EKS**: AWS managed Kubernetes service.
- **EKS auto-mode**: a launch mode where AWS schedules nodes on demand. Pods receive secondary IPs on the node ENI and inherit the AWS-managed cluster shared SG.
- **IRSA**: IAM Roles for Service Accounts. The EKS mechanism that binds an IAM role to a Kubernetes ServiceAccount via OIDC, so pods can call AWS APIs with scoped credentials.
- **OIDC provider**: the IAM identity provider that EKS exposes for IRSA. Each cluster has one; its ARN is needed when creating IRSA roles.
- **RDS**: AWS managed relational database. This plan uses Postgres 15.
- **WAL CDC**: write-ahead-log change data capture. Ark's aggregated apiserver uses Postgres logical replication to watch resource changes and stream them to controllers.
- **ACM**: AWS Certificate Manager, issues TLS certs for AWS load balancers.
- **ECR**: AWS container registry.
- **ESO**: external-secrets-operator. A Kubernetes operator that syncs values from AWS Secrets Manager (and other backends) into k8s Secrets.
- **release-please**: GitHub bot that opens release PRs from conventional commits. Merging the release PR creates a tag; a separate Deploy workflow publishes artifacts.

## 1. Overview

Ark runs on AWS EKS + RDS Postgres today. A spike on 2026-05-12 validated the full path: Model and Agent CRs created via `kubectl`, a Query routed through the aggregated apiserver into RDS, picked up by the controller via Postgres logical replication, executed against OpenAI, response written back to RDS. Roundtrip 2.16 seconds.

Getting there required about ten manual workarounds because the upstream codebase grew up around local minikube and GCP/GKE. Helm charts assume non-cloud defaults. The CLI does not know about IRSA. The AWS terraform under `infrastructure/providers/aws/` is 92 lines and only provisions a VPC and EKS cluster.

The sections below list the gaps, the steps to close them, and the recommended order. Production-grade Ark on EKS+RDS is roughly six to eight weeks of work.

## 2. Goals and success criteria

| Goal | Success criterion |
| --- | --- |
| Low-friction install on EKS+RDS | No `kubectl annotate sa` after install. No local chart swaps. No manual `helm uninstall` retries on a fresh cluster. |
| Reproducible AWS provisioning | `terraform apply` from a clean account produces every input `ark install` needs: cluster name, RDS endpoint, secret reference, IRSA role ARNs. |
| Time from clean AWS account to working Model and Query | Under 25 minutes, in two commands. Today: about 30 minutes and ten manual steps. |
| Production-grade ingress | Public hostnames for `ark-dashboard` and `ark-api`, ACM certs, Route53 records managed by ExternalDNS. |
| Upstream-merged | All work lands as PRs against `mckinsey/agents-at-scale-ark`. |

## 3. Recommended order

Land in parallel: P-1, P-3, P-4, P-10. All small, independently mergeable, no blocking dependencies.

Then sequence the upstream-bottleneck items P-2, P-5, P-6. These need chart and CLI code-owner approval and cannot be landed by an external contributor alone.

Then P-7, P-8, P-9 as production polish. They compose on top of the foundation.

If only one item lands in the next sprint, make it **P-2** (chart `serviceAccountAnnotations`). One PR covers IRSA on EKS, Workload Identity on GKE, and Workload Identity on AKS.

## 4. Current state

Verified on 2026-05-14:

Working:
- Spike terraform applies cleanly to a clean AWS account in `eu-north-1`. Tears down cleanly. Code under `aws-spike/`.
- `ark install --backend postgresql --ark-version 0.1.63-rc` produces a running stack. The `v0.1.63-rc` OCI charts are real (the empty `0.1.62` placeholder was replaced on 2026-05-12).
- PR #2117 (postgres install flow fix) and PR #2132 (apiserver readiness wait) are merged on `main`.
- Aggregated apiserver to RDS to controller via WAL CDC, dispatching to the completions executor, hitting OpenAI, persisting status back to RDS. End-to-end validated.

Not yet in published artifacts:
- `v0.1.63-rc.1` tag was created on 2026-05-13, but the Deploy workflow run for it was cancelled. PR #2132's fix is on `main` and tagged, but is not in any chart or CLI build that npm or OCI serves. Today the way to get it is to build the CLI from a local checkout of `main`.
- `npm @agents-at-scale/ark@0.1.63-rc` is not published. npm latest is still `0.1.62`.

Still manual:
- IRSA role ARNs must be annotated on ServiceAccounts after install. Charts do not expose annotations through values.
- The RDS password lives in AWS Secrets Manager. There is no automatic bridge to a k8s Secret; it must be pulled and applied by hand.
- Six services (`ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `noah`) have no `namespace` key in `arkServices.ts` and land in whichever ns the kubectl context points at (`default` on a fresh cluster).
- The apiserver chart's `sslMode` defaults to `"disable"`. RDS rejects non-SSL connections.
- The terraform-aws-modules/eks/aws module exposes `node_security_group_id`, but auto-mode attaches `cluster_primary_security_group_id` to node ENIs. RDS ingress that allows the former silently times out.
- `file-gateway` PVCs stay Pending. EKS auto-mode includes the EBS CSI driver but does not mark any StorageClass as default.

## 5. Target state

```bash
# One-time per account:
git clone <repo> && cd terraform-aws-ark
terraform apply -var region=eu-north-1
# ~15 min. Produces: VPC, EKS, RDS, IRSA roles, ECR, LB Controller,
# ExternalDNS, cert-manager. Writes terraform-output.json.

# Per environment:
ark install --target aws --terraform-outputs ./terraform-output.json
# ~5 min. Pulls RDS endpoint, secret refs, IRSA role ARNs from terraform
# output. Bridges Secrets Manager to k8s Secret (via ESO). Installs all
# charts with namespaces and IRSA annotations pre-wired. Waits for
# readiness. Exits non-zero on failure.

# Verify:
kubectl get models,agents,queries -A
curl https://ark-api.<your-zone>/healthz
```

The terraform module owns infrastructure. `ark install` owns the application layer. The terraform-outputs JSON is the contract between them.

## 6. Gap analysis

Priorities reflect the cost of the workaround on a user trying to install today.

### P0, blocks AWS users today

| Gap | Where | Status |
| --- | --- | --- |
| Dummy `ark-apiserver:0.1.62` chart | OCI registry | Resolved by `v0.1.63-rc` |
| Apiserver readiness race | `ark-cli` | Resolved by PR #2132 (in `main`, not yet published) |
| Auto-mode SG mismatch (RDS times out) | upstream terraform | Open. Fix baked into spike, needs upstream PR |
| Default `sslMode: "disable"` | apiserver chart | Open, single-value PR |

### P1, install produces an ugly result without a workaround

| Gap | Where | Effort |
| --- | --- | --- |
| Chart SAs have no `serviceAccountAnnotations` values key | controller and apiserver charts | M (about 2 days) |
| 6 services missing `namespace` key in `arkServices.ts` | `tools/ark-cli` | S, config-only patch |
| Controller SA name and namespace hardcoded in template | controller chart | S, parameterise |
| Manual SM to k8s secret bridge | install flow | M, adopt ESO or AWS Secrets Provider |
| No default StorageClass story | install or docs | S, ship a `gp3` StorageClass with `is-default-class: "true"` |
| Stale `targets`-plural Query samples (4 sample files) | `samples/queries/` | S to M, depending on whether the apiserver still rejects plural |
| Deploy workflow does not auto-publish on release tag | `.github/workflows/deploy.yml` | M, CI process change |

### P2, production-grade

| Gap | Where | Effort |
| --- | --- | --- |
| AWS Load Balancer Controller | terraform helm release | M |
| ExternalDNS with IRSA | terraform helm release | M |
| Route53 hosted zone and ACM cert | terraform | M |
| Multi-AZ RDS option | terraform var (already plumbed) | S |
| KMS envelope encryption (EKS and RDS) | terraform | M |
| VPC endpoints (S3, SecretsManager, ECR) | terraform | M |
| RDS backups, PITR, deletion protection, final snapshot | terraform module | S |
| OTel collector and CloudWatch Logs | terraform and chart | L |
| AMP and Grafana | terraform helm release | L |
| Log retention policy | terraform | S |
| Cross-region RDS replica for DR | terraform | M |
| EKS upgrade path documentation | docs | S |

### P3, strategic

| Gap | Where | Effort |
| --- | --- | --- |
| Karpenter explicit (vs auto-mode default) | terraform | M |

## 7. Phased plan

```
                   ┌──────────────────────────────┐
                   │ Phase 0: spike validated     │
                   │ (done 2026-05-12)            │
                   └────────────┬─────────────────┘
                                │
   ┌────────────────────────────┼────────────────────────────┐
   │                            │                            │
┌──▼──────────────┐    ┌────────▼─────────┐    ┌─────────────▼─────┐
│ Phase 1: infra  │    │ Phase 2: install │    │ Phase 3: prod     │
│ upstream PR     │    │ smoothing        │    │ add-ons + obs.    │
│ ~3-4 days       │    │ 1-2 sprints      │    │ 2-3 sprints       │
└─────────────────┘    └──────────────────┘    └───────────────────┘
```

### Phase 1: infra upstream (3 to 4 days)

Owner: external contributor (Stefano). Spike code is already in modular shape.

Deliverables, as one PR to `mckinsey/agents-at-scale-ark`:
- Add `modules/{rds,irsa,ecr}/` next to the current AWS provider, or refactor the existing `providers/aws/` into the modular layout.
- RDS module: Postgres parameter group with `rds.logical_replication=1` and `rds.force_ssl=1`. Password in Secrets Manager. Multi-AZ as a variable. Backups, PITR window, deletion protection, final-snapshot identifier configurable.
- IRSA module: OIDC provider plus roles for `ark-controller` and `ark-apiserver`. The apiserver role gets `secretsmanager:GetSecretValue` scoped to the DB password ARN.
- ECR module: repos for each Ark service image, lifecycle policy.
- Fix the auto-mode SG bug: RDS module accepts a list of allowed SG IDs, includes `cluster_primary_security_group_id`.
- Outputs needed by `ark install`: cluster name, OIDC provider ARN, RDS endpoint, RDS secret name and ARN, role ARNs.
- Docs: AWS tab of `provisioning.mdx` adds RDS, IRSA, ECR sections. `postgres-storage-backend.mdx` adds the RDS minor-retirement caveat (RDS retires Postgres minors quickly; check `aws rds describe-db-engine-versions --engine postgres` for what is offered in the target region).

Acceptance: a contributor following the docs can `terraform apply` and get an EKS cluster plus RDS Postgres ready for `ark install`, in a region of their choice.

### Phase 2: install smoothing (1 to 2 sprints)

Owners split: external contributor for config and sample fixes; upstream maintainers for chart templates and the CLI loop.

Mergeable independently:
1. Chart values gain `serviceAccountAnnotations: {}` in `ark-controller` and `ark-apiserver` (and consistently in the other 7 charts). SA templates render the annotations. Unblocks IRSA role-ARN injection through values.
2. `arkServices.ts`: add `namespace: 'ark-system'` to the 6 services that miss it. The list, verified against `tools/ark-cli/src/arkServices.ts:152-213`: `ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `noah`. Note: `file-gateway` already pins `namespace: 'default'` explicitly.
3. `ark-controller` chart: parameterise the SA name and namespace (the apiserver chart already does this; match the pattern). The current template at `ark/dist/chart/templates/rbac/service_account.yaml` writes `name: ark-controller` and `namespace: ark-system` literally.
4. `chart-apiserver/values.yaml:20`: change `sslMode` default to `"require"`. Document that local-dev users with a non-SSL postgres can override.
5. Generalise the apiserver-readiness exit-non-zero pattern from PR #2132 to other per-service install failures, if not already covered. Recheck `tools/ark-cli/src/commands/install/index.ts:115-133` against current `main`; the swallowed-error path may already be addressed.
6. Ship a default StorageClass option. Either an `ark install --create-default-storageclass=gp3` flag, or the `file-gateway` chart specifies one.
7. Audit the four Query samples that use plural `targets` (`query-streaming.yaml`, `query-with-label-selectors.yaml`, `query-model.yaml`, `query-with-mcp-settings-in-annotations.yaml`). If the apiserver still rejects plural with strict decoding, fix all four. If it accepts plural via a webhook alias, document the alias and the canonical form.

Acceptance: from a Phase-1 cluster, `ark install --backend postgresql --ark-version <published>` succeeds with no `kubectl` between install and first Query.

### Phase 3: production add-ons and observability (2 to 3 sprints)

Terraform module gains helm releases for:
- AWS Load Balancer Controller, with IRSA for ALB and NLB management.
- ExternalDNS, with IRSA scoped to the Route53 zone.
- cert-manager ClusterIssuer wired to Let's Encrypt or ACM Private CA. cert-manager itself is already installed by `ark install` for webhook certs; this adds a public-cert path.
- KMS keys plus envelope encryption on EKS and RDS.
- ESO for the SM-to-Secret bridge.
- VPC endpoints for S3, SecretsManager, ECR (reduces NAT egress cost and is required for any locked-down VPC).
- RDS Multi-AZ flipped on for non-dev environments.

Optional, separable:
- OTel collector plus CloudWatch Logs exporter.
- AMP workspace and Grafana.
- Karpenter for explicit NodePool tuning.

Acceptance: `ark-dashboard.<zone>` and `ark-api.<zone>` resolve, serve TLS, route correctly. Secrets rotate from SM automatically. Phase-3 acceptance does not include OTel and AMP; those are tracked separately so the phase can ship without them.

## 8. Proposals

Ten changes that together close the gap. Each proposal lists what to do, why it pays back, and what blocks it.

### P-1. Upstream the spike's RDS, IRSA, ECR modules and SG fix

Add `modules/{rds,irsa,ecr}/` and fix the auto-mode SG bug. RDS module accepts `allowed_security_group_ids` as a list; defaults include `cluster_primary_security_group_id`. Outputs cover everything `ark install` needs.

The upstream AWS terraform today is 92 lines and only does VPC plus EKS. Anyone adding RDS hits the silent SG timeout that consumed half an afternoon on the spike. This PR turns AWS provisioning into a documented apply.

Owner: external contributor. Effort: 3 to 4 days including docs. Blocks: none.

### P-2. Add `serviceAccountAnnotations` to all Ark charts

Single PR adding `serviceAccountAnnotations: {}` to every chart's `values.yaml` and rendering the annotations in the SA template. The same change to all nine charts, plus a values reference in the docs.

IRSA is the canonical EKS pattern for binding IAM roles to pods. The same SA-annotation mechanism is used by Azure Workload Identity, GKE Workload Identity, and the older in-cluster auth tools like KIAM and kube2iam. One small PR covers all of them. Without it, every cloud user has to `kubectl annotate` after install, and `helm upgrade` undoes the annotation.

Owner: upstream maintainer. Effort: about 2 days, because SA templates differ across charts (the controller chart hardcodes the SA name, the apiserver chart parameterises it, the others not inspected). Blocks: none.

### P-3. Fix the missing `namespace` keys in `arkServices.ts`

Config patch in `tools/ark-cli/src/arkServices.ts` adding `namespace: 'ark-system'` to `ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `noah`. `file-gateway` already pins `namespace: 'default'` and is not in scope.

services landing in `default` is confusing on fresh clusters and breaks the cross-namespace service references inside Ark (e.g. `ark-completions` calling `ark-api`). The intent ("use current context namespace") only helps users who set their context first, and is the wrong default.

Owner: needs upstream maintainer review even though the patch is small, because changing the default ns is a behaviour change for any existing user whose context-default-ns was the install target. Effort: 1 hour patch plus discussion. Blocks: nothing technical.

### P-4. Change apiserver `sslMode` default to `require`

Single-value change in `ark/dist/chart-apiserver/values.yaml:20`.

every cloud-managed Postgres requires SSL. The current default forces every cloud user to override. `require` works against local postgres-with-SSL too; local users without SSL set up can override to `disable`.

Owner: any contributor. Effort: 15 minutes plus a release note. Blocks: none.

### P-5. Generalise the per-service install-failure exit pattern

PR #2132 fixed the apiserver-readiness path: install now exits non-zero when readiness times out. The broader pattern of swallowing per-service errors in `installArk()` should match. Verify against `tools/ark-cli/src/commands/install/index.ts:115-133` on current `main`; if `handleInstallError` already exits non-zero for non-version-not-found errors, this is done.

today, if a service fails to install in CI, the CI run succeeds. PR #2132 fixed the specific case. Closing the general case prevents the next regression.

Owner: upstream maintainer. Effort: half a day if the work is needed, otherwise verification only. Blocks: none.

### P-6. Ship a default StorageClass option

Either a CLI flag `ark install --create-default-storageclass=gp3` that applies a StorageClass marked default, or the `file-gateway` chart specifies a StorageClass explicitly. The former helps any PVC-using component; the latter is narrower.

EKS auto-mode bundles the EBS CSI driver but marks no StorageClass as default. `file-gateway` and any other PVC-using chart stays Pending until a user creates one by hand.

Owner: upstream maintainer. Effort: 1 day including a decision on where the StorageClass lives. Blocks: none.

### P-7. Adopt ESO for the RDS password bridge

Install ESO via terraform helm release with IRSA-scoped Secrets Manager read. `ark install` learns to render an `ExternalSecret` CR (instead of expecting a pre-existing k8s Secret), parameterised on the secret ARN from terraform outputs.

Concrete shape:
- Terraform output: `rds_password_secret_name` (already produced by spike).
- Apiserver chart already reads from `postgresql.passwordSecretName` and `postgresql.passwordSecretKey`.
- New CR `ExternalSecret/ark-db-password` syncs the SM value into a k8s Secret named per `postgresql.passwordSecretName`, keyed per `postgresql.passwordSecretKey`.

today's manual pull means RDS password rotation breaks the apiserver until someone re-syncs. ESO does it continuously and uses IRSA for SM read.

Owner: external contributor for terraform plus the `ExternalSecret` manifest, upstream maintainer for the optional CLI render. Effort: 4 to 5 days end-to-end. Blocks: P-2 (the ESO ServiceAccount needs the IRSA annotation pattern that P-2 introduces).

### P-8. Add `ark install --target aws` profile

A CLI flag that activates AWS defaults. Accepts `--terraform-outputs <path>` and reads:
- RDS endpoint, secret name, IRSA role ARNs.
- Renders ExternalSecret for the RDS password.
- Sets `serviceAccountAnnotations` on chart SAs from the role ARNs.
- Defaults `sslMode` to `require` if P-4 is not in.
- Skips `file-gateway` PVC creation unless a StorageClass is named.

a single command from terraform output to running cluster. Targeted profiles let cloud-specific defaults exist without polluting local dev. Same pattern as `kubectl --context`.

Split this into design and implementation:
- Design (1 week): agree on the terraform-outputs JSON schema, the `--target <cloud>` interface, and which defaults a profile may override.
- Implementation (1 to 2 weeks): build the loader, the chart-args mapper, and the tests.

Owner: design needs upstream maintainer sign-off; implementation can be split. Effort: 2 to 3 weeks total. Blocks: P-1 (outputs schema), P-2 (chart annotation values), P-3 (namespace fixes), P-7 (ESO substrate).

### P-9. Publish a versioned terraform-aws-ark module

Pin the Phase 1 plus Phase 3 terraform to a release tag and reference it as `git::https://github.com/mckinsey/agents-at-scale-ark.git//infrastructure/aws-stack?ref=v0.1.X`. Subpath approach over Terraform Registry because it shares the release cadence of the Ark codebase and avoids a separate registry account. Future option to publish to the Registry remains open.

lets downstream users pin a working Ark plus infrastructure combination instead of consuming from `main`.

Owner: external contributor plus upstream maintainer for the tagging convention. Effort: 2 days after Phase 1 and Phase 3 are merged. Blocks: P-1 and the relevant Phase 3 items.

### P-10. Auto-trigger Deploy workflow on release tag

Change `.github/workflows/deploy.yml` so a `v*` tag push automatically dispatches with `deploy_helm_chart=true`, `deploy_to_npm=true`, `deploy_containers=true`. Today these flags require a human to remember to tick them. `v0.1.63-rc.1`'s Deploy was cancelled and the artifacts were never published.

Releases that ship charts but not the CLI (or no artifacts at all) are a real problem. `v0.1.63-rc.1` is on the tag list but nothing is in any registry. Manual flags are easy to forget; auto-firing on the release tag matches how the rest of the org ships.

Owner: upstream maintainer (CI ownership). Effort: 1 day. Blocks: nothing. Risk: low; the change is reversible.

## 9. Risks and dependencies

| Risk | Mitigation |
| --- | --- |
| Upstream maintainers do not prioritise P-2, P-5, P-6 | External contributor can land P-1, P-4, P-9, P-10 independently. P-2 is the upstream-owned bottleneck and the highest payback. |
| RDS Postgres minor versions get retired (spike hit `15.7 not found`) | Pin the terraform default to the latest minor offered. Document the `aws rds describe-db-engine-versions` check in `postgres-storage-backend.mdx`. |
| Release pipeline keeps publishing incomplete releases (charts without CLI) | P-10 fixes this. Until then, `--ark-version` override plus local CLI build is the documented workaround. |
| EKS auto-mode behaviour changes | Use `cluster_primary_security_group_id` as the canonical "node SG" reference. It is AWS-managed and stable across auto-mode and managed-node-group attachments. |
| External-contributor velocity on the upstream repo | The recent PR history (PRs #1958, #2117) shows non-trivial PRs landing. P-3 in particular needs code-owner approval even though the patch is small, because it is a behaviour change. |
| Phase 3 effort is aggressive if the external contributor is solo | KMS plus IAM key policies alone is typically a day of debugging. The 2 to 3 sprint estimate assumes maintainers also contribute on the chart side. |

Open dependencies blocking specific phases:
- Upstream release engineers re-dispatching Deploy for `v0.1.63-rc.1`, or implementing P-10. Workaround exists (build CLI locally, use `--ark-version`).
- Security review of the IRSA role policies and KMS key policies before Phase 3 goes to non-dev environments.

## 10. Open questions

1. **Terraform module ownership**. Does Ark ship `terraform-aws-ark` itself (P-9 subpath approach), or should the upstream publish a consumer module in a separate repo? Affects who owns the lifecycle of the module.
2. **Multi-tenancy posture**. One Ark cluster per tenant, or one cluster with namespace isolation? Affects how `ark-tenant` is wired and how IRSA roles are scoped. This is a design choice tracked here because it influences Phase 1 IRSA role definitions (one role per tenant vs one role per service); resolving it before Phase 1 ships is preferable.
3. **Image distribution**. Pull from `ghcr.io/mckinsey/...` directly (cross-region pull cost, ghcr egress dependency) or mirror to ECR (the spike provisions ECR but does not mirror images)? Phase 1 acceptance should state which path is shipped.
4. **Egress posture**. Assume NAT-out-to-Internet works (the spike's default), or build for a fully-locked-down VPC with PrivateLink and VPC endpoints to OpenAI and Anthropic? Affects Phase 3 scope.

## 11. AgentCore

AgentCore will be covered in the next days.

## Appendix

For the per-line backlog of every gap from the spike (including resolved items with strikethrough), see `aws-spike/FOLLOWUP.md`. For the chronological validation log, see `aws-spike/NOTES.md`. This file is the plan. The other two are the line-item backlog and the validation log.
