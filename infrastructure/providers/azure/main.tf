locals {
  tags = {
    Environment = "dev"
    Terraform   = "true"
    ManagedBy   = "Terraform"
  }
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.azure_region
  tags     = local.tags
}
