module "gke" {
  source  = "terraform-google-modules/kubernetes-engine/google"
  version = "~> 38.0"

  project_id             = var.gcp_project_id
  name                   = var.cluster_name
  region                 = var.gcp_region
  network                = module.gcp-network.network_name
  subnetwork             = local.subnet_names[index(module.gcp-network.subnets_names, local.subnet_name)]
  ip_range_pods          = local.pods_range_name
  ip_range_services      = local.services_range_name
  create_service_account = true
  enable_cost_allocation = true
  gcs_fuse_csi_driver    = true
  fleet_project          = var.gcp_project_id
  deletion_protection    = false
  stateful_ha            = true
}