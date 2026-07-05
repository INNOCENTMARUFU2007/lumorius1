resource "aws_db_subnet_group" "main" {
  name       = "lumorius-${var.environment}-db-subnet"
  subnet_ids = var.private_subnet_ids
}

resource "aws_security_group" "rds" {
  name   = "lumorius-${var.environment}-rds-sg"
  vpc_id = var.vpc_id
  ingress {
    from_port   = 5432 ; to_port = 5432 ; protocol = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }
  egress { from_port = 0 ; to_port = 0 ; protocol = "-1" ; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_db_instance" "main" {
  identifier             = "lumorius-${var.environment}"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = var.instance_class
  allocated_storage      = var.allocated_storage
  storage_encrypted      = true
  db_name                = var.db_name
  username               = var.db_username
  password               = var.db_password
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az               = true
  backup_retention_period = 30
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "lumorius-${var.environment}-final"
  performance_insights_enabled = true
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}
