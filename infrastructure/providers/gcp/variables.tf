variable "gcp_region" {
  description = "Target GCP region"
  type        = string
}

variable "gcp_project_id" {
  description = "Target GCP project ID"
  type    = string
}

variable "cluster_name" {
  description = "Name of the ARK cluster"
  type        = string
  default     = "ark-cluster"
}

variable "cluster_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.33"
}