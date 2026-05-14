data "aws_availability_zones" "this" {
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  azs = slice(data.aws_availability_zones.this.names, 0, 3)

  tags = {
    Environment = var.environment
    Initiative  = "ark-aws-spike"
    ManagedBy   = "terraform"
  }
}

module "vpc" {
  source = "./modules/vpc"

  name = "${var.cluster_name}-vpc"
  azs  = local.azs
  tags = local.tags
}

module "eks" {
  source = "./modules/eks"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  tags            = local.tags
}

module "rds" {
  source = "./modules/rds"

  identifier     = "${var.cluster_name}-postgres"
  engine_version = var.rds_engine_version
  instance_class = var.rds_instance_class
  multi_az       = var.rds_multi_az
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnets
  allowed_security_group_ids = [
    module.eks.cluster_primary_security_group_id,
    module.eks.node_security_group_id,
  ]
  tags = local.tags
}

module "irsa" {
  source = "./modules/irsa"

  cluster_name            = var.cluster_name
  oidc_provider_arn       = module.eks.oidc_provider_arn
  oidc_provider_url       = module.eks.oidc_provider_url
  rds_password_secret_arn = module.rds.password_secret_arn
  tags                    = local.tags
}

module "ecr" {
  source = "./modules/ecr"

  repositories = var.ecr_repositories
  tags         = local.tags
}
