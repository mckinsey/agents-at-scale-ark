variable "aws_region" {
  type    = string
  default = "eu-north-1"
}

variable "cluster_name" {
  type    = string
  default = "ark-cluster"
}

variable "cluster_version" {
  type    = string
  default = "1.33"
}

variable "rds_multi_az" {
  type    = bool
  default = false
}

variable "rds_instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "rds_engine_version" {
  type    = string
  default = "15.17"
}

variable "ecr_repositories" {
  type = list(string)
  default = [
    "ark/ark-controller",
    "ark/ark-api",
    "ark/ark-apiserver",
    "ark/ark-broker",
    "ark/ark-dashboard",
    "ark/ark-mcp",
    "ark/localhost-gateway",
  ]
}

variable "environment" {
  type    = string
  default = "dev"
}
