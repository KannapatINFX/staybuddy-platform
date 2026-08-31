# Current Sprint

**Sprint:** 4 — Environments, Infrastructure, and Observability Baseline

**Status:** CONDITIONAL — implementation and local verification pass; hosted dev deployment is externally gated

**Updated:** 31 August 2026

## Completed and verified locally

- Terraform validates reproducible dev, staging, and production foundations for VPC/networking, ECS Fargate, RDS PostgreSQL, encrypted Redis, private S3/CloudFront, ALB/WAF/TLS, KMS, ECR, CloudWatch logs, and alarms.
- Application secrets remain in a pre-provisioned customer-KMS-encrypted Secrets Manager JSON secret; RDS manages its own credential secret. Neither value set enters Terraform state or GitHub.
- API and worker preload OpenTelemetry, emit X-Ray-compatible trace IDs over OTLP to ADOT sidecars, propagate worker trace context, expose safe response trace/correlation IDs, and capture unhandled errors in Sentry without default PII.
- Immutable production layouts contain copied workspace packages. ECS migration prerequisite containers serialize forward migrations before API/worker startup, and deployment circuit breakers roll back unhealthy releases.
- Manual GitHub OIDC deployment bootstraps environment-qualified immutable ECR repositories, applies a saved plan, waits for service stability, validates database-backed health, and requires the health trace to be present in X-Ray.
- `pnpm ci:verify` passes against a fresh PostgreSQL 17 database, including 32 Sprint 4 structural controls, 21/21 typecheck tasks, 21/21 unit-test tasks, four database integration tests, four API integration groups, 14/14 builds, 15 artifact groups, app-factory validation, and secret scanning.
- ADR-0005, environment examples, backend example, and deployment/recovery runbook are current.

## External exit-gate evidence still required

1. Configure the public repository's protected `dev` environment, GitHub OIDC role, versioned state bucket, ACM certificate/DNS, customer KMS key, application secret/Sentry DSN, and health URL.
2. Set `DEV_DEPLOY_ENABLED=true` only after those controls are reviewed.
3. Run `Deploy Dev` from the accepted commit and retain the workflow evidence showing API/worker stability, healthy PostgreSQL, 32-hex response trace ID, and a matching X-Ray trace.
4. Obtain the independent pull-request approval required by protected `main` before merge.

The Sprint 4 exit gate has not yet passed because API and worker have not been deployed to an authorized AWS dev account from CI. Sprint 5 has not started.
