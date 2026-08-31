data "aws_availability_zones" "available" {
  state = "available"
}
data "aws_caller_identity" "current" {}

locals {
  name = "staybuddy-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = local.name
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

resource "aws_subnet" "public" {
  for_each                = toset(local.azs)
  vpc_id                  = aws_vpc.main.id
  availability_zone       = each.value
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, index(local.azs, each.value))
  map_public_ip_on_launch = true
  tags = {
    Name = "${local.name}-public-${each.value}"
  }
}

resource "aws_subnet" "private" {
  for_each          = toset(local.azs)
  vpc_id            = aws_vpc.main.id
  availability_zone = each.value
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, index(local.azs, each.value) + 8)
  tags = {
    Name = "${local.name}-private-${each.value}"
  }
}

resource "aws_eip" "nat" {
  domain = "vpc"
}
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = values(aws_subnet.public)[0].id
  depends_on    = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
}
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }
}
resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}
resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_kms_key" "main" {
  description             = "${local.name} application and data key"
  enable_key_rotation     = true
  deletion_window_in_days = 30
}
resource "aws_kms_alias" "main" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.main.key_id
}

resource "aws_s3_bucket" "assets" {
  bucket = "${local.name}-assets-${data.aws_caller_identity.current.account_id}"
}
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
  }
}
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "random_password" "database" {
  length           = 40
  special          = true
  override_special = "!#$%&*+-.:=?@^_"
}
resource "aws_secretsmanager_secret" "database" {
  name       = "${local.name}/database"
  kms_key_id = aws_kms_key.main.arn
}
resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    host     = aws_db_instance.postgres.address
    port     = 5432
    dbname   = "staybuddy"
    username = "staybuddy_app"
    password = random_password.database.result
  })
}
resource "aws_secretsmanager_secret" "application" {
  name       = "${local.name}/application"
  kms_key_id = aws_kms_key.main.arn
}

resource "aws_db_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}
resource "aws_security_group" "database" {
  name   = "${local.name}-database"
  vpc_id = aws_vpc.main.id
}
resource "aws_security_group" "cache" {
  name   = "${local.name}-cache"
  vpc_id = aws_vpc.main.id
}
resource "aws_security_group" "service" {
  name   = "${local.name}-service"
  vpc_id = aws_vpc.main.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = aws_vpc.main.id
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port       = 4000
    to_port         = 4000
    protocol        = "tcp"
    security_groups = [aws_security_group.service.id]
  }
}
resource "aws_vpc_security_group_ingress_rule" "database_service" {
  security_group_id            = aws_security_group.database.id
  referenced_security_group_id = aws_security_group.service.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "cache_service" {
  security_group_id            = aws_security_group.cache.id
  referenced_security_group_id = aws_security_group.service.id
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
}
resource "aws_vpc_security_group_ingress_rule" "service_alb" {
  security_group_id            = aws_security_group.service.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 4000
  to_port                      = 4000
  ip_protocol                  = "tcp"
}

resource "aws_db_instance" "postgres" {
  identifier                   = local.name
  engine                       = "postgres"
  instance_class               = var.database_instance_class
  allocated_storage            = 50
  max_allocated_storage        = 500
  storage_encrypted            = true
  kms_key_id                   = aws_kms_key.main.arn
  db_name                      = "staybuddy"
  username                     = "staybuddy_app"
  password                     = random_password.database.result
  db_subnet_group_name         = aws_db_subnet_group.main.name
  vpc_security_group_ids       = [aws_security_group.database.id]
  multi_az                     = var.environment == "production"
  backup_retention_period      = var.environment == "production" ? 14 : 3
  deletion_protection          = var.environment == "production"
  performance_insights_enabled = true
  skip_final_snapshot          = var.environment != "production"
  final_snapshot_identifier    = var.environment == "production" ? "${local.name}-final" : null
  apply_immediately            = var.environment != "production"
}

resource "aws_elasticache_subnet_group" "main" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = local.name
  description                = "StayBuddy queues and cache"
  engine                     = "redis"
  node_type                  = var.redis_node_type
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.cache.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = var.environment == "production"
  multi_az_enabled           = var.environment == "production"
  num_cache_clusters         = var.environment == "production" ? 2 : 1
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
resource "aws_cloudwatch_log_group" "api" {
  name              = "/staybuddy/${var.environment}/api"
  retention_in_days = var.environment == "production" ? 90 : 14
  kms_key_id        = aws_kms_key.main.arn
}
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/staybuddy/${var.environment}/worker"
  retention_in_days = var.environment == "production" ? 90 : 14
  kms_key_id        = aws_kms_key.main.arn
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }, Action = "sts:AssumeRole"
    }]
  })
}
resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = aws_iam_role.execution.assume_role_policy
}
resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_secretsmanager_secret.database.arn, aws_secretsmanager_secret.application.arn]
      }, {
      Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"], Resource = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
    }]
  })
}

resource "aws_lb" "api" {
  name               = substr(local.name, 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = values(aws_subnet.public)[*].id
}
resource "aws_lb_target_group" "api" {
  name        = substr("${local.name}-api", 0, 32)
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
  health_check {
    path                = "/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.api.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_wafv2_web_acl" "api" {
  name  = "${local.name}-api"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-common-rule-set"
    priority = 10
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name}-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-api"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api" {
  resource_arn = aws_lb.api.arn
  web_acl_arn  = aws_wafv2_web_acl.api.arn
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name = "api", image = var.api_image, essential = true, portMappings = [{
      containerPort = 4000
      }], environment = [{
      name = "NODE_ENV", value = var.environment
      }, {
      name = "AWS_REGION", value = var.aws_region
      }, {
      name = "PGDATABASE", value = "staybuddy"
      }, {
      name = "PGSSLMODE", value = "require"
      }], secrets = [{
      name = "PGHOST", valueFrom = "${aws_secretsmanager_secret.database.arn}:host::"
      }, {
      name = "PGUSER", valueFrom = "${aws_secretsmanager_secret.database.arn}:username::"
      }, {
      name = "PGPASSWORD", valueFrom = "${aws_secretsmanager_secret.database.arn}:password::"
      }, {
      name = "BOOTSTRAP_PRIVATE_KEY_HEX", valueFrom = "${aws_secretsmanager_secret.application.arn}:BOOTSTRAP_PRIVATE_KEY_HEX::"
      }, {
      name = "EMAIL_LOOKUP_HMAC_SECRET", valueFrom = "${aws_secretsmanager_secret.application.arn}:EMAIL_LOOKUP_HMAC_SECRET::"
      }, {
      name = "PII_ENCRYPTION_KEY_BASE64", valueFrom = "${aws_secretsmanager_secret.application.arn}:PII_ENCRYPTION_KEY_BASE64::"
      }, {
      name = "OTP_PEPPER", valueFrom = "${aws_secretsmanager_secret.application.arn}:OTP_PEPPER::"
      }, {
      name = "GUEST_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.application.arn}:GUEST_JWT_SECRET::"
      }, {
      name = "STAFF_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.application.arn}:STAFF_JWT_SECRET::"
      }], logConfiguration = {
      logDriver = "awslogs", options = {
        "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "api"
      }
      }, healthCheck = {
      command = ["CMD-SHELL", "node -e \"fetch('http://localhost:4000/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""], interval = 30, timeout = 5, retries = 3
    }
  }])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([{
    name = "worker", image = var.worker_image, essential = true, environment = [{
      name = "NODE_ENV", value = var.environment
      }, {
      name = "AWS_REGION", value = var.aws_region
      }, {
      name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
      }], secrets = [{
      name = "PGHOST", valueFrom = "${aws_secretsmanager_secret.database.arn}:host::"
      }, {
      name = "PGUSER", valueFrom = "${aws_secretsmanager_secret.database.arn}:username::"
      }, {
      name = "PGPASSWORD", valueFrom = "${aws_secretsmanager_secret.database.arn}:password::"
      }], logConfiguration = {
      logDriver = "awslogs", options = {
        "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "worker"
      }
    }
  }])
}

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.api_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 4000
  }
  depends_on = [aws_lb_listener.https]
}
resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.worker_desired_count
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.service.id]
    assign_public_ip = false
  }
}

resource "aws_cloudwatch_metric_alarm" "api_unhealthy" {
  alarm_name  = "${local.name}-api-unhealthy"
  namespace   = "AWS/ApplicationELB"
  metric_name = "UnHealthyHostCount"
  dimensions = {
    TargetGroup = aws_lb_target_group.api.arn_suffix, LoadBalancer = aws_lb.api.arn_suffix
  }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name  = "${local.name}-database-cpu"
  namespace   = "AWS/RDS"
  metric_name = "CPUUtilization"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.id
  }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
