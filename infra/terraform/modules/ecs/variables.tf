variable "environment"         {}
variable "vpc_id"              {}
variable "public_subnet_ids"   { type = list(string) }
variable "private_subnet_ids"  { type = list(string) }
variable "ecr_api_image"       {}
variable "ecr_web_image"       {}
variable "api_cpu"             { default = 1024 }
variable "api_memory"          { default = 2048 }
variable "web_cpu"             { default = 512 }
variable "web_memory"          { default = 1024 }
variable "desired_count"       { default = 2 }
variable "database_url"        { sensitive = true }
variable "redis_url"           { sensitive = true }
variable "s3_bucket"           {}
variable "s3_region"           {}
variable "jwt_secret"          { sensitive = true }
variable "jwt_refresh_secret"  { sensitive = true }
variable "openai_api_key"      { sensitive = true }
variable "anthropic_api_key"   { sensitive = true }
variable "stripe_secret_key"   { sensitive = true }
