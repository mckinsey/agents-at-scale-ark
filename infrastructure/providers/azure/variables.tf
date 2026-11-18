variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "azure_region" {
  description = "Target Azure region"
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "ark-rg"
}

variable "cluster_name" {
  description = "Name of the Ark cluster"
  type        = string
  default     = "ark-cluster"
}

variable "kubernetes_version" {
  description = "Kubernetes version for AKS"
  type        = string
  default     = "1.35"
}

variable "node_count" {
  description = "Number of nodes in the default node pool"
  type        = number
  default     = 3
}

variable "node_vm_size" {
  description = "VM size for AKS nodes"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "postgres_admin_username" {
  description = "Administrator username for PostgreSQL"
  type        = string
  default     = "arkadmin"
}

variable "postgres_admin_password" {
  description = "Administrator password for PostgreSQL"
  type        = string
  sensitive   = true
}

variable "postgres_sku_name" {
  description = "SKU name for PostgreSQL"
  type        = string
  default     = "GP_Standard_D2s_v3"
}

variable "postgres_storage_mb" {
  description = "Storage size for PostgreSQL in MB"
  type        = number
  default     = 32768
}

variable "langfuse_db_name" {
  description = "Database name for Langfuse"
  type        = string
  default     = "langfuse"
}

variable "langfuse_version" {
  description = "Langfuse Helm chart version to deploy"
  type        = string
  default     = "1.5.30"
}

variable "langfuse_nextauth_secret" {
  description = "NextAuth secret for Langfuse"
  type        = string
  sensitive   = true
}

variable "langfuse_salt" {
  description = "Salt for Langfuse encryption"
  type        = string
  sensitive   = true
}
