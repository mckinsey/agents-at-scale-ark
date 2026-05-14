# AWS spike: EKS + RDS Postgres for Ark

This is the validated terraform that proves the deployment shape described in `openspec/changes/aws-eks-rds-deployment/`. It is named "spike" because it lives outside the current `infrastructure/providers/aws/` module while the OpenSpec change is under review. Once accepted, the modular layout here folds into `infrastructure/providers/aws/`.

## What this provisions

- VPC, 3 AZs, single NAT, public + private + intra subnets.
- EKS auto-mode cluster with the `general-purpose` node pool.
- RDS Postgres 15 (single-AZ by default, Multi-AZ as a variable). SSL enforced via `rds.force_ssl=1`. Logical replication enabled via `rds.logical_replication=1` so the aggregated apiserver can use Postgres CDC.
- Password generated and stored in AWS Secrets Manager.
- IRSA roles for `ark-controller` and `ark-apiserver`. The apiserver role has `secretsmanager:GetSecretValue` scoped to the DB password ARN.
- ECR repositories for each Ark service image.

The RDS security group allows ingress from both the AWS-managed cluster shared SG and the EKS module's node SG. This handles EKS auto-mode, which attaches the cluster shared SG to node ENIs rather than the module's node SG.

## Apply

```bash
cd infrastructure/aws-spike

# Provide AWS credentials via your usual mechanism (env vars, profile, etc.)

cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars to set region, cluster name, RDS sizing, etc.

terraform init
terraform plan
terraform apply
```

Apply takes about 15 minutes. EKS control plane creation is the slow step.

## Point ark install at the cluster

```bash
$(terraform output -raw kubeconfig_command)

SECRET_NAME=$(terraform output -raw rds_password_secret_name)
PASSWORD=$(aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text)

kubectl create namespace ark-system
kubectl -n ark-system create secret generic ark-db-password --from-literal=password="$PASSWORD"

cat > .arkrc.yaml <<EOF
storage:
  backend: postgresql
  postgresql:
    host: $(terraform output -raw rds_endpoint)
    port: $(terraform output -raw rds_port)
    database: $(terraform output -raw rds_database_name)
    user: $(terraform output -raw rds_username)
    passwordSecretName: ark-db-password
    passwordSecretKey: password
    sslMode: require
EOF

ark install -y --backend postgresql --ark-version 0.1.63-rc
```

The `--ark-version 0.1.63-rc` is needed today because `npm @agents-at-scale/ark` is still at `0.1.62` while the matching OCI charts have been published as `0.1.63-rc`. Once a release ships both artifacts together, the flag goes away.

## Tear down

```bash
terraform destroy
```

## Outputs

- `cluster_name`, `cluster_endpoint`, `oidc_provider_arn`: needed by `aws eks update-kubeconfig` and by anyone adding IRSA roles outside terraform.
- `rds_endpoint`, `rds_port`, `rds_database_name`, `rds_username`, `rds_password_secret_name`, `rds_password_secret_arn`: needed by `ark install` and by `ExternalSecret` rendering.
- `ark_controller_role_arn`, `ark_apiserver_role_arn`: needed by the SA annotation step (once chart `serviceAccountAnnotations` is wired, otherwise applied via `kubectl annotate`).
- `ecr_repository_urls`: map of service name to ECR repo URL.
- `kubeconfig_command`: convenience string for the `aws eks update-kubeconfig` invocation.

## What is intentionally not here

- AWS Load Balancer Controller, ExternalDNS, cert-manager wiring, KMS envelope encryption, VPC endpoints, Multi-AZ, log retention, OTel collector: all in Phase 3 of the OpenSpec change.
- AgentCore A2A: covered separately.
- Mirror of upstream container images into ECR: ECR repos are provisioned but not populated.

## Costs

Roughly $170 per month if left running (EKS control plane $73, NAT gateway $32, RDS db.t3.medium single-AZ $60, plus small Secrets Manager and storage costs). Destroy when not in use.
