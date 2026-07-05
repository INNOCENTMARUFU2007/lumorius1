output "alb_dns_name"       { value = module.ecs.alb_dns_name }
output "rds_endpoint"       { value = module.rds.endpoint ; sensitive = true }
output "redis_endpoint"     { value = module.redis.primary_endpoint ; sensitive = true }
output "s3_bucket_name"     { value = module.s3.bucket_name }
output "ecs_cluster_name"   { value = module.ecs.cluster_name }
