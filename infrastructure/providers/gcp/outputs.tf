output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = module.gke.name
}

output "gke_cluster_location" {
  description = ""
  value       = module.gke.location
}

output "artifact_registry_repository" {
  description = "Artifact Registry repository URL"
  value       = "${google_artifact_registry_repository.ark.location}-docker.pkg.dev/${var.gcp_project_id}/${google_artifact_registry_repository.ark.repository_id}"
}

output "github_actions_sa_email" {
  description = "GitHub Actions service account email"
  value       = google_service_account.github_actions.email
}

output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions"
  value       = "projects/${var.gcp_project_id}/locations/global/workloadIdentityPools/${google_iam_workload_identity_pool.github.workload_identity_pool_id}/providers/${google_iam_workload_identity_pool_provider.github.workload_identity_pool_provider_id}"
}