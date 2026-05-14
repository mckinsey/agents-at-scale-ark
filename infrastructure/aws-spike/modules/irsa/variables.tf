variable "cluster_name" {
  type = string
}

variable "oidc_provider_arn" {
  type = string
}

variable "oidc_provider_url" {
  type = string
}

variable "controller_namespace" {
  type    = string
  default = "ark-system"
}

variable "controller_service_account" {
  type    = string
  default = "ark-controller"
}

variable "apiserver_namespace" {
  type    = string
  default = "ark-system"
}

variable "apiserver_service_account" {
  type    = string
  default = "ark-apiserver"
}

variable "rds_password_secret_arn" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
