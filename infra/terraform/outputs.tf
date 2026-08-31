output "vpc_id" {
  value = aws_vpc.main.id
}
output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}
output "database_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}
output "redis_endpoint" {
  value     = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive = true
}
output "asset_bucket" {
  value = aws_s3_bucket.assets.id
}
output "api_load_balancer" {
  value = aws_lb.api.dns_name
}
