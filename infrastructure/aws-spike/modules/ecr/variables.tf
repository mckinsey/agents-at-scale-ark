variable "repositories" {
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

variable "keep_last_images" {
  type    = number
  default = 20
}

variable "tags" {
  type    = map(string)
  default = {}
}
