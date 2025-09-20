variable "aws_region" {
  description = "Target AWS region"
  type        = string
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