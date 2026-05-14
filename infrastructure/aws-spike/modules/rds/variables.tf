variable "identifier" {
  type    = string
  default = "ark-postgres"
}

variable "engine_version" {
  type    = string
  default = "15.17"
}

variable "instance_class" {
  type    = string
  default = "db.t3.medium"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "database_name" {
  type    = string
  default = "ark"
}

variable "username" {
  type    = string
  default = "ark"
}

variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for the DB subnet group"
}

variable "allowed_security_group_ids" {
  type        = list(string)
  description = "Security group IDs allowed to reach Postgres on 5432. For EKS auto-mode you typically need the cluster primary SG (used by node ENIs), not the module's node_security_group_id."
}

variable "tags" {
  type    = map(string)
  default = {}
}
