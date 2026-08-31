# Foundation Operations Runbook

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
- Deploy API/worker rolling or canary; verify health, traces, migrations and queue consumption.
- Tenant app/build failure cannot block other tenant release lanes.
- Production secrets live in Secrets Manager/KMS, never Terraform variables/state values, app config, mobile bundle or repository.

## Pre-deployment gates

- Run `pnpm ci:verify` against a disposable environment; this includes quality, migration, integration, build, artifact, app-factory, and secret gates.
- Run `terraform -chdir=infra/terraform fmt -check -recursive` and `terraform -chdir=infra/terraform validate` before plan/apply.
- Production app profiles must reject placeholder assets and `example.invalid` URLs.
- Confirm app package identifiers, signed bootstrap identity, minimum version, privacy URLs, OAuth audience/client IDs, email sender, APNs/FCM, store signing, DNS, and ACM certificate for the same tenant/environment.
- Never treat successful synthetic Expo exports as signed store-build approval; complete native device QA and store credential checks first.

## Sprint 1-10 evidence

The reproducible local verification record and remaining external gates are maintained in
`../SPRINT_1_10_RELEASE_EVIDENCE.md`.
