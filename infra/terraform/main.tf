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
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*"
      }, {
      Sid = "CloudWatchLogsEncryption", Effect = "Allow", Principal = { Service = "logs.${var.aws_region}.amazonaws.com" }, Action = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"], Resource = "*", Condition = { ArnLike = { "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/staybuddy/${var.environment}/*" } }
      }, {
      Sid = "CloudFrontAssetDecryption", Effect = "Allow", Principal = { Service = "cloudfront.amazonaws.com" }, Action = ["kms:Decrypt"], Resource = "*", Condition = { StringLike = { "AWS:SourceArn" = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*" } }
    }]
  })
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
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    id     = "expire-incomplete-and-old-versions"
    status = "Enabled"
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
    noncurrent_version_expiration {
      noncurrent_days = var.environment == "production" ? 90 : 30
    }
  }
}
resource "aws_cloudfront_origin_access_control" "assets" {
  name                              = "${local.name}-assets"
  description                       = "Private StayBuddy asset bucket access"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_distribution" "assets" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name} assets"
  price_class     = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id                = "assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.assets.id
  }

  default_cache_behavior {
    target_origin_id       = "assets"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    min_ttl     = 0
    default_ttl = 3600
    max_ttl     = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}
resource "aws_s3_bucket_policy" "assets" {
  bucket = aws_s3_bucket.assets.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Sid = "AllowCloudFrontRead", Effect = "Allow", Principal = { Service = "cloudfront.amazonaws.com" }, Action = "s3:GetObject", Resource = "${aws_s3_bucket.assets.arn}/*", Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.assets.arn } }
    }]
  })
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
  identifier                      = local.name
  engine                          = "postgres"
  instance_class                  = var.database_instance_class
  allocated_storage               = 50
  max_allocated_storage           = 500
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.main.arn
  db_name                         = "staybuddy"
  username                        = "staybuddy_app"
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = aws_kms_key.main.arn
  db_subnet_group_name            = aws_db_subnet_group.main.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  multi_az                        = var.environment == "production"
  backup_retention_period         = var.environment == "production" ? 14 : 3
  deletion_protection             = var.environment == "production"
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.main.arn
  skip_final_snapshot             = var.environment != "production"
  final_snapshot_identifier       = var.environment == "production" ? "${local.name}-final" : null
  apply_immediately               = var.environment != "production"
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
resource "aws_ecr_repository" "api" {
  name                 = "${local.name}-api"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }
}
resource "aws_ecr_repository" "worker" {
  name                 = "${local.name}-worker"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
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
resource "aws_cloudwatch_log_group" "otel" {
  name              = "/staybuddy/${var.environment}/otel"
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
resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = [aws_db_instance.postgres.master_user_secret[0].secret_arn, var.application_secret_arn]
      }, {
      Effect = "Allow", Action = ["kms:Decrypt"], Resource = compact([aws_kms_key.main.arn, var.application_secret_kms_key_arn])
    }]
  })
}
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = aws_iam_role.execution.assume_role_policy
}
resource "aws_iam_role_policy" "task" {
  role = aws_iam_role.task.id
  policy = jsonencode({
    Version = "2012-10-17", Statement = [{
      Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"], Resource = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
      }, {
      Effect = "Allow", Action = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey"], Resource = [aws_kms_key.main.arn]
      }, {
      Effect = "Allow", Action = ["xray:PutTraceSegments", "xray:PutTelemetryRecords", "xray:GetSamplingRules", "xray:GetSamplingTargets", "xray:GetSamplingStatisticSummaries"], Resource = ["*"]
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
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.api_image
      essential = true
      dependsOn = [
        { containerName = "aws-otel-collector", condition = "START" },
        { containerName = "migration", condition = "SUCCESS" }
      ]
      portMappings = [{ containerPort = 4000 }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "DEPLOYMENT_ENV", value = var.environment },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "SERVICE_VERSION", value = var.release_version },
        { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = "http://localhost:4318" },
        { name = "PGDATABASE", value = "staybuddy" },
        { name = "PGSSLMODE", value = "require" }
      ]
      secrets = [
        { name = "PGHOST", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:host::" },
        { name = "PGUSER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" },
        { name = "BOOTSTRAP_PRIVATE_KEY_HEX", valueFrom = "${var.application_secret_arn}:BOOTSTRAP_PRIVATE_KEY_HEX::" },
        { name = "EMAIL_LOOKUP_HMAC_SECRET", valueFrom = "${var.application_secret_arn}:EMAIL_LOOKUP_HMAC_SECRET::" },
        { name = "PII_ENCRYPTION_KEY_BASE64", valueFrom = "${var.application_secret_arn}:PII_ENCRYPTION_KEY_BASE64::" },
        { name = "OTP_PEPPER", valueFrom = "${var.application_secret_arn}:OTP_PEPPER::" },
        { name = "GUEST_JWT_SECRET", valueFrom = "${var.application_secret_arn}:GUEST_JWT_SECRET::" },
        { name = "STAFF_JWT_SECRET", valueFrom = "${var.application_secret_arn}:STAFF_JWT_SECRET::" },
        { name = "SENTRY_DSN", valueFrom = "${var.application_secret_arn}:SENTRY_DSN::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "api"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"fetch('http://localhost:4000/v1/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
    {
      name      = "migration"
      image     = var.api_image
      essential = false
      command   = ["node", "node_modules/@staybuddy/db/dist/cli.js", "migrate"]
      environment = [
        { name = "PGDATABASE", value = "staybuddy" },
        { name = "PGSSLMODE", value = "require" }
      ]
      secrets = [
        { name = "PGHOST", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:host::" },
        { name = "PGUSER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.api.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "migration"
        }
      }
    },
    {
      name      = "aws-otel-collector"
      image     = var.otel_collector_image
      essential = true
      command   = ["--config=/etc/ecs/otel-instance-metrics-config.yaml"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.otel.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = var.worker_image
      essential = true
      dependsOn = [
        { containerName = "aws-otel-collector", condition = "START" },
        { containerName = "migration", condition = "SUCCESS" }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "DEPLOYMENT_ENV", value = var.environment },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "SERVICE_VERSION", value = var.release_version },
        { name = "OTEL_EXPORTER_OTLP_ENDPOINT", value = "http://localhost:4318" },
        { name = "PGDATABASE", value = "staybuddy" },
        { name = "PGSSLMODE", value = "require" },
        { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379" }
      ]
      secrets = [
        { name = "PGHOST", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:host::" },
        { name = "PGUSER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" },
        { name = "SENTRY_DSN", valueFrom = "${var.application_secret_arn}:SENTRY_DSN::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "worker"
        }
      }
      healthCheck = {
        command     = ["CMD-SHELL", "node -e \"import('ioredis').then(async m=>{const r=new m.default(process.env.REDIS_URL,{maxRetriesPerRequest:1});await r.ping();await r.quit()}).catch(()=>process.exit(1))\""]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    },
    {
      name      = "migration"
      image     = var.api_image
      essential = false
      command   = ["node", "node_modules/@staybuddy/db/dist/cli.js", "migrate"]
      environment = [
        { name = "PGDATABASE", value = "staybuddy" },
        { name = "PGSSLMODE", value = "require" }
      ]
      secrets = [
        { name = "PGHOST", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:host::" },
        { name = "PGUSER", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:username::" },
        { name = "PGPASSWORD", valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::" }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.worker.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "migration"
        }
      }
    },
    {
      name      = "aws-otel-collector"
      image     = var.otel_collector_image
      essential = true
      command   = ["--config=/etc/ecs/otel-instance-metrics-config.yaml"]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group" = aws_cloudwatch_log_group.otel.name, "awslogs-region" = var.aws_region, "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name                               = "api"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.api.arn
  desired_count                      = var.api_desired_count
  launch_type                        = "FARGATE"
  health_check_grace_period_seconds  = 60
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
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
  name                               = "worker"
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.worker.arn
  desired_count                      = var.worker_desired_count
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
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
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.name}-api-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions = {
    TargetGroup  = aws_lb_target_group.api.arn_suffix
    LoadBalancer = aws_lb.api.arn_suffix
  }
  treat_missing_data = "notBreaching"
  alarm_actions      = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${local.name}-api-p95-latency"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0.5
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    TargetGroup  = aws_lb_target_group.api.arn_suffix
    LoadBalancer = aws_lb.api.arn_suffix
  }
  treat_missing_data = "notBreaching"
  alarm_actions      = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${local.name}-database-storage-low"
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 10737418240
  comparison_operator = "LessThanThreshold"
  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgres.id
  }
  alarm_actions = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
resource "aws_cloudwatch_metric_alarm" "redis_connections" {
  alarm_name          = "${local.name}-redis-connections"
  namespace           = "AWS/ElastiCache"
  metric_name         = "CurrConnections"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 500
  comparison_operator = "GreaterThanThreshold"
  dimensions = {
    ReplicationGroupId = aws_elasticache_replication_group.redis.id
  }
  alarm_actions = var.alarm_topic_arn == null ? [] : [var.alarm_topic_arn]
}
