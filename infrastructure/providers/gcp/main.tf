locals {
  cluster_type                = "simple-regional"
  network_name                = "aas-ark-gke-private-network-${var.gcp_region}"
  subnet_name                 = "aas-ark-gke-private-subnet-${var.gcp_region}"
  master_auth_subnetwork      = "aas-ark-gke-private-master-subnet-${var.gcp_region}"
  pods_range_name             = "ip-range-pods-aas-ark-gke-private"
  services_range_name         = "ip-range-services-aas-ark-gke-private"
  subnet_names                = [for subnet_self_link in module.gcp-network.subnets_self_links : split("/", subnet_self_link)[length(split("/", subnet_self_link)) - 1]]
}