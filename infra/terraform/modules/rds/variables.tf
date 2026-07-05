variable "environment"        {}
variable "vpc_id"             {}
variable "private_subnet_ids" { type = list(string) }
variable "db_name"            {}
variable "db_username"        {}
variable "db_password"        { sensitive = true }
variable "instance_class"     { default = "db.t3.medium" }
variable "allocated_storage"  { default = 100 }
