resource "aws_ecs_cluster" "main" {
  name = "lumorius-${var.environment}"
  setting { name = "containerInsights" ; value = "enabled" }
}

resource "aws_security_group" "alb" {
  name   = "lumorius-${var.environment}-alb-sg"
  vpc_id = var.vpc_id
  ingress { from_port = 80  ; to_port = 80  ; protocol = "tcp" ; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 443 ; to_port = 443 ; protocol = "tcp" ; cidr_blocks = ["0.0.0.0/0"] }
  egress  { from_port = 0   ; to_port = 0   ; protocol = "-1"  ; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_security_group" "ecs" {
  name   = "lumorius-${var.environment}-ecs-sg"
  vpc_id = var.vpc_id
  ingress { from_port = 0 ; to_port = 65535 ; protocol = "tcp" ; security_groups = [aws_security_group.alb.id] }
  egress  { from_port = 0 ; to_port = 0     ; protocol = "-1"  ; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_lb" "main" {
  name               = "lumorius-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids
  enable_deletion_protection = true
}

resource "aws_iam_role" "ecs_execution" {
  name = "lumorius-${var.environment}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow" ; Principal = { Service = "ecs-tasks.amazonaws.com" } ; Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/lumorius-${var.environment}-api"
  retention_in_days = 90
}

resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/lumorius-${var.environment}-web"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "api" {
  family                   = "lumorius-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.api_cpu
  memory                   = var.api_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([{
    name  = "api"
    image = var.ecr_api_image
    portMappings = [{ containerPort = 5000 ; protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV"          ; value = "production" },
      { name = "PORT"              ; value = "5000" },
      { name = "DATABASE_URL"      ; value = var.database_url },
      { name = "REDIS_URL"         ; value = var.redis_url },
      { name = "S3_BUCKET"         ; value = var.s3_bucket },
      { name = "AWS_REGION"        ; value = var.s3_region },
      { name = "JWT_SECRET"        ; value = var.jwt_secret },
      { name = "JWT_REFRESH_SECRET"; value = var.jwt_refresh_secret },
      { name = "OPENAI_API_KEY"    ; value = var.openai_api_key },
      { name = "ANTHROPIC_API_KEY" ; value = var.anthropic_api_key },
      { name = "STRIPE_SECRET_KEY" ; value = var.stripe_secret_key }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.api.name
        "awslogs-region"        = "us-east-1"
        "awslogs-stream-prefix" = "api"
      }
    }
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:5000/api/health || exit 1"]
      interval    = 30 ; timeout = 5 ; retries = 3 ; startPeriod = 60
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "lumorius-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  deployment_controller { type = "ECS" }
  deployment_circuit_breaker { enable = true ; rollback = true }
}

resource "aws_appautoscaling_target" "api" {
  max_capacity       = 20
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "lumorius-${var.environment}-api-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  target_tracking_scaling_policy_configuration {
    predefined_metric_specification { predefined_metric_type = "ECSServiceAverageCPUUtilization" }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
