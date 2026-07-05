variable "environment"        {}
variable "vpc_id"             {}
variable "private_subnet_ids" { type = list(string) }
variable "node_type"          { default = "cache.t3.medium" }
variable "num_cache_nodes"    { default = 2 }
