resource "aws_elasticache_subnet_group" "main" {
  name       = "lumorius-${var.environment}-redis-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "redis" {
  name   = "lumorius-${var.environment}-redis-sg"
  vpc_id = var.vpc_id
  ingress {
    from_port = 6379 ; to_port = 6379 ; protocol = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
  egress { from_port = 0 ; to_port = 0 ; protocol = "-1" ; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "lumorius-${var.environment}"
  description                = "Lumorius Redis cluster"
  node_type                  = var.node_type
  num_cache_clusters         = var.num_cache_nodes
  automatic_failover_enabled = true
  multi_az_enabled           = true
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.redis.id]
  snapshot_retention_limit   = 7
}
