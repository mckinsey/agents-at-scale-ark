Tasks are grouped into phases. Two items resolved before this change opened: dummy `ark-apiserver:0.1.62` chart (replaced by `v0.1.63-rc`) and the apiserver readiness race (PR #2132 merged on `main`).

## 1. Phase 1 — infrastructure upstream PR

- [ ] 1.1 Add `infrastructure/providers/aws/modules/rds/` (Postgres parameter group with `rds.logical_replication=1` and `rds.force_ssl=1`, password in Secrets Manager, `multi_az` variable, backups, PITR retention, deletion protection, final-snapshot identifier configurable)
- [ ] 1.2 Add `infrastructure/providers/aws/modules/irsa/` (OIDC provider and roles for `ark-controller` and `ark-apiserver`; apiserver role gets `secretsmanager:GetSecretValue` scoped to the DB password ARN)
- [ ] 1.3 Add `infrastructure/providers/aws/modules/ecr/` (repos for each Ark service image, lifecycle policy)
- [ ] 1.4 Fix the auto-mode SG bug: RDS module accepts `allowed_security_group_ids` list; root passes both `cluster_primary_security_group_id` and `node_security_group_id`
- [ ] 1.5 Outputs: cluster name, OIDC provider ARN, RDS endpoint, RDS secret name and ARN, IRSA role ARNs
- [ ] 1.6 Update `docs/content/operations-guide/provisioning.mdx` AWS tab with RDS, IRSA, ECR sections
- [ ] 1.7 Update `docs/content/operations-guide/postgres-storage-backend.mdx` with the RDS minor-retirement caveat
- [ ] 1.8 Acceptance: a contributor following the docs can `terraform apply` and get an EKS cluster plus RDS Postgres ready for `ark install`, in a region of their choice

## 2. Phase 2 — chart and CLI smoothing

- [ ] 2.1 Add `serviceAccountAnnotations: {}` to `ark/dist/chart-apiserver/values.yaml` and render in `templates/serviceaccount.yaml`
- [ ] 2.2 Add `serviceAccountAnnotations: {}` to `ark/dist/chart/values.yaml` and render in `templates/rbac/service_account.yaml`. Parameterise the hardcoded SA name and namespace (apiserver chart pattern)
- [ ] 2.3 Repeat for the other seven charts (`ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `ark-completions`, `localhost-gateway`)
- [ ] 2.4 Update `tools/ark-cli/src/arkServices.ts`: add `namespace: 'ark-system'` to `ark-api`, `ark-broker`, `ark-dashboard`, `ark-mcp`, `ark-tenant`, `noah`. Leave `file-gateway` at its explicit `namespace: 'default'`
- [ ] 2.5 Change `ark/dist/chart-apiserver/values.yaml` default `sslMode` from `"disable"` to `"require"`
- [ ] 2.6 Verify the per-service install-failure exit pattern in `tools/ark-cli/src/commands/install/index.ts`; generalise PR #2132's apiserver-readiness exit-non-zero pattern if not already covered
- [ ] 2.7 Ship a default StorageClass option: either `ark install --create-default-storageclass=gp3` flag or `file-gateway` chart specifies one
- [ ] 2.8 Audit four sample files (`samples/queries/query-streaming.yaml`, `query-with-label-selectors.yaml`, `query-model.yaml`, `query-with-mcp-settings-in-annotations.yaml`) against current Query schema; fix or document the plural-targets handling
- [ ] 2.9 Acceptance: `ark install --backend postgresql --ark-version <published>` succeeds with no `kubectl` between install and first Query, on a Phase-1 cluster

## 3. Phase 3 — production add-ons

- [ ] 3.1 Terraform helm release for AWS Load Balancer Controller, with IRSA for ALB and NLB management
- [ ] 3.2 Terraform helm release for ExternalDNS, with IRSA scoped to the Route53 zone
- [ ] 3.3 Terraform helm release for ESO (external-secrets-operator), with IRSA for Secrets Manager read
- [ ] 3.4 Terraform module gains Route53 hosted zone and ACM cert provisioning
- [ ] 3.5 KMS keys plus envelope encryption on EKS and RDS
- [ ] 3.6 VPC endpoints for S3, SecretsManager, ECR (cost reduction; required for locked-down VPC)
- [ ] 3.7 RDS Multi-AZ flipped on for non-dev environments via a variable
- [ ] 3.8 Add `--target aws` profile to `ark install`: design (terraform outputs schema agreed; `--target <cloud>` interface designed; defaults a profile may override agreed) then implementation (loader, chart-args mapper, tests)
- [ ] 3.9 Render an `ExternalSecret` CR for the RDS password bridge from terraform outputs and chart values
- [ ] 3.10 Optional, separable: OTel collector and CloudWatch Logs exporter, AMP workspace and Grafana, Karpenter for explicit NodePool tuning
- [ ] 3.11 Acceptance: `ark-dashboard.<zone>` and `ark-api.<zone>` resolve, serve TLS, route correctly; secrets rotate from Secrets Manager automatically

## 4. Process changes

- [ ] 4.1 Change `.github/workflows/deploy.yml` so a `v*` tag push automatically dispatches with `deploy_helm_chart=true`, `deploy_to_npm=true`, `deploy_containers=true`
- [ ] 4.2 Publish `terraform-aws-ark` as a versioned subpath: reference as `git::https://github.com/mckinsey/agents-at-scale-ark.git//infrastructure/aws-stack?ref=v0.1.X`. Tag at release time. Document the pinning convention
- [ ] 4.3 Re-dispatch Deploy on `v0.1.63-rc.1` (or wait for 4.1 to land and re-tag) so PR #2132's apiserver-readiness fix exists in a published artifact

## 5. Pre-flight (open questions to answer before Phase 1 ships)

- [ ] 5.1 Multi-tenancy posture: one Ark cluster per tenant, or one cluster with namespace isolation? Decision affects whether IRSA roles in Phase 1 are one-per-tenant or one-per-service
- [ ] 5.2 Image distribution: pull from `ghcr.io` directly, or mirror to ECR? Phase 1 acceptance states which path ships
- [ ] 5.3 Egress posture: NAT-out-to-Internet, or PrivateLink and VPC endpoints? Affects Phase 3 scope
