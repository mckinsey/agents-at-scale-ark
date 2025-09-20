data "google_compute_subnetwork" "subnetwork" {
  name    = local.subnet_names[index(module.gcp-network.subnets_names, local.subnet_name)]
  project = var.gcp_project_id
  region  = var.gcp_region
}

module "gcp-network" {
  source  = "terraform-google-modules/network/google"
  version = ">= 7.5"

  project_id   = var.gcp_project_id
  network_name = local.network_name

  subnets = [
    {
      subnet_name           = local.subnet_name
      subnet_ip             = "10.0.0.0/17"
      subnet_region         = var.gcp_region
      subnet_private_access = true
    },
    {
      subnet_name   = local.master_auth_subnetwork
      subnet_ip     = "10.60.0.0/17"
      subnet_region = var.gcp_region
    },
  ]

  secondary_ranges = {
    (local.subnet_name) = [
      {
        range_name    = local.pods_range_name
        ip_cidr_range = "192.168.0.0/18"
      },
      {
        range_name    = local.services_range_name
        ip_cidr_range = "192.168.64.0/18"
      },
    ]
  }
}
