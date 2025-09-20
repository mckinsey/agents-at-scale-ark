terraform {
  backend "s3" {}
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">=6.9"
    }
  }
}

provider "aws" {
  region = var.aws_region
}