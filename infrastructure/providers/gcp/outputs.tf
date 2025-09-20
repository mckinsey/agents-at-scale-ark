output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = module.gke.name
}

output "gke_cluster_location" {
  description = ""
  value       = module.gke.location
}