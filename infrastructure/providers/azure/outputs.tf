output "resource_group_name" {
  description = "Resource Group Name"
  value       = azurerm_resource_group.rg.name
}

output "aks_cluster_name" {
  description = "AKS Cluster Name"
  value       = azurerm_kubernetes_cluster.aks.name
}

output "aks_cluster_id" {
  description = "AKS Cluster ID"
  value       = azurerm_kubernetes_cluster.aks.id
}

output "aks_kube_config" {
  description = "AKS kubeconfig"
  value       = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive   = true
}

output "postgres_fqdn" {
  description = "PostgreSQL Server FQDN"
  value       = azurerm_postgresql_flexible_server.postgres.fqdn
}

output "postgres_server_name" {
  description = "PostgreSQL Server Name"
  value       = azurerm_postgresql_flexible_server.postgres.name
}

output "langfuse_namespace" {
  description = "Langfuse Kubernetes Namespace"
  value       = kubernetes_namespace_v1.langfuse.metadata[0].name
}

output "langfuse_service_name" {
  description = "Langfuse Service Name"
  value       = "langfuse"
}
