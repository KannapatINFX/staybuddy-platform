# Architecture Decision Records

The canonical StayBuddy ADR ledger is [`../../../docs/adr/`](../../../docs/adr/), as required by the workspace-level agent rules. This directory is the target-monorepo entry point so engineers can find those decisions without maintaining a conflicting second ledger.

Sprint 3 engineering-system choices are recorded in [`ADR-0004`](../../../docs/adr/ADR-0004-target-monorepo-engineering-system.md). Sprint 4 environment, infrastructure, deployment, and observability choices are recorded in [`ADR-0005`](../../../docs/adr/ADR-0005-aws-environment-observability-deployment.md).
The MVP/pilot hosting boundary that keeps frontend-only web delivery on Hostinger and the trusted backend/data plane on AWS is recorded in [`ADR-0006`](../../../docs/adr/ADR-0006-hostinger-frontend-aws-backend-boundary.md).
Sprint 5 database identities, tenant/platform authorization, RLS, idempotency, audit, and outbox delivery are recorded in [`ADR-0007`](../../../docs/adr/ADR-0007-tenant-security-runtime-and-reliable-mutations.md).
