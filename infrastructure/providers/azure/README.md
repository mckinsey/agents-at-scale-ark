# Azure AKS Infrastructure for Ark

Terraform configuration for deploying Ark to Azure Kubernetes Service (AKS) with Langfuse and PostgreSQL.

## Prerequisites

- Azure CLI installed and authenticated
- Terraform >= 1.0
- Azure subscription with appropriate permissions

## Resources Created

- **Resource Group**: Container for all Azure resources
- **Virtual Network**: Network infrastructure with dedicated subnets for AKS and PostgreSQL
- **AKS Cluster**: Managed Kubernetes cluster with autoscaling
- **PostgreSQL Flexible Server**: Managed PostgreSQL database with high availability
- **Langfuse**: Deployed via Helm chart with PostgreSQL backend
- **Log Analytics Workspace**: For AKS monitoring and logs

## Quick Start

```bash
# Initialize Terraform
terraform init

# Review the execution plan
terraform plan -var-file=terraform.tfvars

# Apply the configuration
terraform apply -var-file=terraform.tfvars

# Get AKS credentials
az aks get-credentials --resource-group <resource-group-name> --name <cluster-name>
```

## Required Variables

Create a `terraform.tfvars` file with the following variables:

```hcl
subscription_id           = "your-azure-subscription-id"
azure_region              = "eastus"
resource_group_name       = "ark-rg"
cluster_name              = "ark-cluster"
postgres_admin_password   = "your-secure-password"
langfuse_nextauth_secret  = "your-nextauth-secret"
langfuse_salt             = "your-encryption-salt"
```

## Optional Variables

See `variables.tf` for additional configuration options including:
- `kubernetes_version`: AKS version (default: "1.30")
- `node_count`: Number of nodes (default: 3)
- `node_vm_size`: VM size for nodes (default: "Standard_D4s_v3")
- `postgres_sku_name`: PostgreSQL SKU (default: "GP_Standard_D2s_v3")

## Backend Configuration

Configure Azure Storage backend for state management:

```bash
terraform init \
  -backend-config="resource_group_name=<rg-name>" \
  -backend-config="storage_account_name=<storage-account>" \
  -backend-config="container_name=<container>" \
  -backend-config="key=ark.tfstate"
```

## Accessing Services

### AKS Cluster
```bash
az aks get-credentials --resource-group ark-rg --name ark-cluster
kubectl get nodes
```

### Langfuse
```bash
# Get Langfuse service details
kubectl get svc -n langfuse

# Port forward to access locally
kubectl port-forward -n langfuse svc/langfuse 3000:3000
```

### PostgreSQL
Connection string format:
```
postgresql://<admin-username>:<password>@<fqdn>:5432/langfuse?sslmode=require
```

## Security Notes

- PostgreSQL is deployed in a delegated subnet with private DNS
- AKS uses Azure CNI with network policies enabled
- Secrets are stored in Kubernetes secrets (consider Azure Key Vault for production)
- High availability is enabled for PostgreSQL with zone redundancy

## Cleanup

```bash
terraform destroy -var-file=terraform.tfvars
```
