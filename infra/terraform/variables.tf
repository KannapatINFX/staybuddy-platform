variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "environment must be dev, staging or production"
  }
}
variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}
variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}
variable "api_image" {
  type = string
}
variable "worker_image" {
  type = string
}
variable "release_version" {
  type        = string
  description = "Immutable source revision deployed by CI"
  validation {
    condition     = can(regex("^[0-9a-f]{7,40}$", var.release_version))
    error_message = "release_version must be a 7-40 character Git SHA"
  }
}
variable "application_secret_arn" {
  type        = string
  description = "Pre-provisioned Secrets Manager JSON secret containing application keys and SENTRY_DSN"
  validation {
    condition     = can(regex("^arn:aws:secretsmanager:", var.application_secret_arn))
    error_message = "application_secret_arn must be a Secrets Manager ARN"
  }
}
variable "application_secret_kms_key_arn" {
  type        = string
  description = "Customer-managed KMS key ARN used by the application secret"
  validation {
    condition     = can(regex("^arn:aws:kms:", var.application_secret_kms_key_arn))
    error_message = "application_secret_kms_key_arn must be a KMS key ARN"
  }
}
variable "otel_collector_image" {
  type        = string
  description = "Pinned AWS Distro for OpenTelemetry collector image"
  default     = "public.ecr.aws/aws-observability/aws-otel-collector:v0.45.0"
  validation {
    condition     = !endswith(var.otel_collector_image, ":latest")
    error_message = "otel_collector_image must use an immutable version tag or digest, never latest"
  }
}
variable "certificate_arn" {
  type        = string
  description = "ACM certificate ARN for the public API HTTPS listener"
  validation {
    condition     = can(regex("^arn:aws:acm:", var.certificate_arn))
    error_message = "certificate_arn must be an ACM certificate ARN"
  }
}
variable "api_desired_count" {
  type    = number
  default = 1
}
variable "worker_desired_count" {
  type    = number
  default = 1
}
variable "database_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "alarm_topic_arn" {
  type    = string
  default = null
}
