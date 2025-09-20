module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = "ark-vpc"
  cidr = local.aws_vpc_cidr

  azs             = local.aws_azs
  private_subnets = [for k, v in local.aws_azs : cidrsubnet(local.aws_vpc_cidr, 4, k)]
  public_subnets  = [for k, v in local.aws_azs : cidrsubnet(local.aws_vpc_cidr, 8, k + 48)]
  intra_subnets   = [for k, v in local.aws_azs : cidrsubnet(local.aws_vpc_cidr, 8, k + 52)]

  create_igw = true
  enable_nat_gateway = true
  single_nat_gateway = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }

  tags = local.tags
}
