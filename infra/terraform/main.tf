terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "lumorius-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "lumorius-terraform-lock"
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "lumorius"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "vpc" {
  source             = "./modules/vpc"
  environment        = var.environment
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}

module "rds" {
  source             = "./modules/rds"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  instance_class     = var.rds_instance_class
  allocated_storage  = var.rds_allocated_storage
}

module "redis" {
  source             = "./modules/redis"
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  node_type          = var.redis_node_type
  num_cache_nodes    = var.redis_num_cache_nodes
}

module "s3" {
  source      = "./modules/s3"
  environment = var.environment
  bucket_name = var.s3_bucket_name
}

module "ecs" {
  source              = "./modules/ecs"
  environment         = var.environment
  vpc_id              = module.vpc.vpc_id
  public_subnet_ids   = module.vpc.public_subnet_ids
  private_subnet_ids  = module.vpc.private_subnet_ids
  ecr_api_image       = var.ecr_api_image
  ecr_web_image       = var.ecr_web_image
  api_cpu             = var.api_cpu
  api_memory          = var.api_memory
  web_cpu             = var.web_cpu
  web_memory          = var.web_memory
  desired_count       = var.desired_count
  database_url        = "postgresql://${var.db_username}:${var.db_password}@${module.rds.endpoint}/${var.db_name}"
  redis_url           = "redis://${module.redis.primary_endpoint}:6379"
  s3_bucket           = module.s3.bucket_name
  s3_region           = var.aws_region
  jwt_secret          = var.jwt_secret
  jwt_refresh_secret  = var.jwt_refresh_secret
  openai_api_key      = var.openai_api_key
  anthropic_api_key   = var.anthropic_api_key
  stripe_secret_key   = var.stripe_secret_key
}
