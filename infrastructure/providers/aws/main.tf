locals {
  aws_azs      = slice(data.aws_availability_zones.available.names, 0, 3)
  aws_vpc_cidr = "10.0.0.0/16"
  tags = {
    Environment = "dev"
    Terraform   = "true"
  }
}

data "aws_availability_zones" "available" {
  # Exclude local zones
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}
