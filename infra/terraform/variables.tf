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
