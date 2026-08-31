# Foundation Operations Runbook

## Environment contract

| Environment | Runtime mode                                         | Data                                      | Availability baseline                                       | Deployment authority                          |
| ----------- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| Local       | `NODE_ENV=development`, `DEPLOYMENT_ENV=development` | Synthetic only                            | Docker Compose/PostgreSQL/Redis; no production dependency   | Developer                                     |
| Dev         | `NODE_ENV=production`, `DEPLOYMENT_ENV=dev`          | Synthetic only                            | One API task, one worker task, single-node cache            | GitHub `dev` environment                      |
| Staging     | `NODE_ENV=production`, `DEPLOYMENT_ENV=staging`      | Synthetic or approved anonymized fixtures | Production-shaped release rehearsal                         | Protected staging environment                 |
| Production  | `NODE_ENV=production`, `DEPLOYMENT_ENV=production`   | Authorized tenant data                    | Multi-AZ RDS, two-node Redis, at least two API/worker tasks | Protected production environment and approval |

Terraform examples are `infra/terraform/{dev,staging,production}.tfvars.example`. They contain placeholders only. Never commit real account IDs, secret values, certificates, state configuration, or tenant data.

## One-time AWS and GitHub setup

1. In `ap-southeast-1`, provision a versioned, encrypted S3 Terraform-state bucket with public access blocked. The deploy role must be able to use S3 native lockfiles.
2. Create a GitHub OIDC deploy role restricted to this repository, the `dev` environment, and the `main` ref. Grant only the Terraform-managed resource actions plus ECR push, ECS wait/describe, and `xray:BatchGetTraces` needed by the workflow.
3. Provision an ACM certificate for the dev API hostname.
4. Create a customer-managed KMS key and one Secrets Manager JSON secret. Required keys are `BOOTSTRAP_PRIVATE_KEY_HEX`, `EMAIL_LOOKUP_HMAC_SECRET`, `PII_ENCRYPTION_KEY_BASE64`, `OTP_PEPPER`, `GUEST_JWT_SECRET`, `STAFF_JWT_SECRET`, and `SENTRY_DSN`. The workflow receives only the secret and key ARNs; values never enter GitHub or Terraform state.
5. Configure the GitHub `dev` environment with an independent reviewer when available. Add repository/environment variables `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `TF_STATE_BUCKET`, `TF_STATE_KEY`, `DEV_APPLICATION_SECRET_ARN`, `DEV_APPLICATION_SECRET_KMS_KEY_ARN`, `DEV_CERTIFICATE_ARN`, and `DEV_API_HEALTH_URL`. Set `DEV_DEPLOY_ENABLED=true` only after every value and IAM boundary has been reviewed.

The manual `Deploy Dev` workflow authenticates with short-lived OIDC credentials, bootstraps environment-specific immutable ECR repositories, reuses an existing SHA tag on safe reruns, applies a saved Terraform plan, waits for ECS stability, checks PostgreSQL-backed health, validates the 32-character trace ID, and confirms that trace is queryable in X-Ray.

## Health and correlation

- API health: `GET /v1/health`; target normal non-AI p95 below 500ms in-region.
- Every request/job uses a trace ID; every mutation carries a correlation ID and idempotency key.
- API and worker logs go to separate CloudWatch groups. Guest responses expose safe error codes plus trace ID only.

## Alert baseline

- API unhealthy targets, 5xx/error-rate and latency regression.
- PostgreSQL CPU/storage/connections, failed backups and replica/Multi-AZ events.
- Redis connection/backlog and BullMQ failed/dead-letter jobs.
- Tenant/RLS authorization anomalies, OTP throttling, claim replay, app minimum-version/crash regression.
- Later modules add import staleness, AI cost/tool failure, delivery failures, ledger mismatch and settlement alerts.

## Failure handling

1. Confirm affected environment/tenant and trace ID; do not disable RLS.
2. Stop or feature-flag only the failing tenant/module when possible.
3. Preserve request/job/outbox/audit evidence.
4. Retry only through idempotent command/job paths.
5. If database recovery is needed, target RPO ≤15 minutes and RTO ≤2 hours; run restore in isolation before cutover.
6. Guest surfaces degrade to safe cache, deterministic help and human contact where relevant.

## Deployment

- Apply backward-compatible database migration before application code.
- ECS task definitions run the forward-only migration container before either API or worker starts. A PostgreSQL advisory lock serializes concurrent task starts; a migration hash mismatch fails the task instead of mutating history.
- Deploy API/worker rolling or canary; verify health, traces, migrations and queue consumption.
- Images use immutable commit-SHA tags. ECS deployment circuit breakers automatically roll back tasks that cannot become healthy.
- Tenant app/build failure cannot block other tenant release lanes.
- Production secrets live in Secrets Manager/KMS, never Terraform variables/state values, app config, mobile bundle or repository.

## Rollback and recovery

1. Stop the deployment and retain the failed task, CloudWatch log stream, GitHub run, Terraform plan, release SHA, trace ID, and Sentry event references.
2. For application failure, redeploy the last known-good immutable SHA. Do not roll back a forward migration; use a reviewed compensating migration.
3. For ECS instability, confirm the circuit-breaker rollback completed and both services are stable before closing the incident.
4. For data recovery, restore RDS to an isolated instance, reconcile tenant/audit/outbox state, and rehearse cutover. The target remains RPO ≤15 minutes and RTO ≤2 hours.
5. Never bypass RLS, delete Terraform state, rotate or expose secrets through CI logs, or make a production database the recovery test target.

## Pre-deployment gates

- Run `pnpm ci:verify` against a disposable environment; this includes quality, migration, integration, build, artifact, app-factory, and secret gates.
- Run `terraform -chdir=infra/terraform fmt -check -recursive` and `terraform -chdir=infra/terraform validate` before plan/apply.
- Production app profiles must reject placeholder assets and `example.invalid` URLs.
- Confirm app package identifiers, signed bootstrap identity, minimum version, privacy URLs, OAuth audience/client IDs, email sender, APNs/FCM, store signing, DNS, and ACM certificate for the same tenant/environment.
- Never treat successful synthetic Expo exports as signed store-build approval; complete native device QA and store credential checks first.

## Sprint 1-10 evidence

The reproducible local verification record and remaining external gates are maintained in
`../SPRINT_1_10_RELEASE_EVIDENCE.md`.
