output "aws_region" {
  value = var.aws_region
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "rds_endpoint" {
  value = module.rds.endpoint
}

output "rds_port" {
  value = module.rds.port
}

output "rds_database_name" {
  value = module.rds.database_name
}

output "rds_username" {
  value = module.rds.username
}

output "rds_password_secret_name" {
  value = module.rds.password_secret_name
}

output "rds_password_secret_arn" {
  value = module.rds.password_secret_arn
}

output "ark_controller_role_arn" {
  value = module.irsa.controller_role_arn
}

output "ark_apiserver_role_arn" {
  value = module.irsa.apiserver_role_arn
}

output "ecr_repository_urls" {
  value = module.ecr.repository_urls
}

output "kubeconfig_command" {
  value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
