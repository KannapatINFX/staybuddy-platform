# Sprint 5 Acceptance Report

**Sprint:** 5 — Core Database, Tenant Boundary, Audit, Outbox, and Idempotency

**Review date:** 1 September 2026

**Status:** CONDITIONAL — implementation plus local and hosted exit gates pass; independent approval and the Sprint 4 dependency gate remain

**Next sprint:** Sprint 6 — not started

## Source reviewed

- `../../agent.md`, especially tenant/security, delivery, Definition of Done, release gates, and decision protocol.
- `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`, Sprint 5 goal, deliverables, and exit gate.
- `../../Code Aug/StayBuddy_Developer_Blueprint_v1_0_2026-08-28.md`, architecture principles, multi-tenant isolation, RBAC, security/audit, correlation, outbox, reliability, API/event, and test contracts.
- `../docs/product/DOMAIN_AND_EVENT_CATALOG.md`, Platform Foundation ownership and event envelope.
- ADR-0001 through ADR-0007.

## Deliverable assessment

| Deliverable                      | Evidence                                                                                                                                                                         | Result                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Foundation schema                | Hotel/location/app/feature/department/membership, platform identity/grant, audit, tenant/platform idempotency, and outbox schema with tenant-safe composite foreign keys         | PASS                                                    |
| Trusted tenant context           | Runtime login has no direct table grants; every tenant/platform operation enters an explicit transaction, assumes a scoped role, and sets trusted actor/tenant/trace context     | PASS                                                    |
| RLS isolation                    | Explicit policies cover every current tenant table; platform authenticator/resolver/support/system policies are narrow; Hotel A read/write and policy-matrix tests pass          | PASS                                                    |
| Authentication and authorization | Active database identity and membership/grant validation, enumerated RBAC permissions, resource/department checks, role-elevation/suspension rejection, and test-only debug auth | PASS                                                    |
| Idempotency                      | Tenant and platform scopes persist request fingerprints and responses; same-input replay succeeds and changed-input reuse returns a stable conflict                              | PASS                                                    |
| Audit and events                 | Material platform mutations write append-only audit plus immutable outbox facts atomically with actor, command, trace, correlation, causation, and metadata                      | PASS                                                    |
| Retry/dead letter                | Tenant-by-tenant outbox relay, deduplicated BullMQ job IDs, recoverable claim lease, exponential retry, terminal dead-letter state, and operations runbook                       | PASS                                                    |
| Runtime deployment identity      | RDS master renamed `staybuddy_migrator`; API/worker use non-owner `staybuddy_runtime`; migration task alone receives master secret and configures runtime password               | PASS locally; cloud deployment belongs to Sprint 4 gate |

## Reproducible local evidence

The following passed against a newly initialized PostgreSQL 17 database on 1 September 2026:

```bash
pnpm tenant-foundation:check
CI=true DATABASE_URL=postgresql://localhost:55439/staybuddy pnpm ci:verify
```

Observed evidence:

- Four forward migrations applied from an empty database, including `0004_tenant_security_foundation.sql`; migration hash/concurrency controls pass.
- The Sprint 5 verifier passes 27 structural security and reliable-mutation controls. The prior Sprint 4 verifier still passes all 32 controls.
- PostgreSQL integration passes 12/12 cases: non-owner runtime privileges, Hotel A/Hotel B read and write isolation, tenant policy coverage, composite-foreign-key isolation, idempotent replay/mismatch, append-only audit, immutable outbox facts, claim ownership, retry, and dead-letter behavior.
- API integration passes 5/5 end-to-end groups, including active platform/staff identity resolution, tenant membership, role-elevation/suspension rejection, and tenant/platform idempotency.
- Typecheck and unit graphs pass 21/21 tasks; build passes 14/14 workspaces and all 15 artifact groups.
- Terraform validation, OpenAPI/contract checks, dependency/fixture policy, app-factory validation, and secret scanning pass.
- No production data, Hostinger configuration, AWS resource, provider credential, or legacy tracked file was accessed or changed.

## Hosted CI evidence

Stacked pull request [#3](https://github.com/KannapatINFX/staybuddy-platform/pull/3) at implementation commit `e42c9c09b079703ac91012980635830320fae4cb` passed all four checks in [run 33425464616](https://github.com/KannapatINFX/staybuddy-platform/actions/runs/33425464616) on 1 September 2026:

- `Required / Quality`: PASS in 1m28s, including all 27 Sprint 5 controls and 32 Sprint 4 controls.
- `Required / Migrations & Integration`: PASS in 1m00s against clean PostgreSQL/Redis services.
- `Required / Build Artifacts`: PASS in 3m47s, including API and worker production Docker images.
- `Required / Secret Scan`: PASS in 36s.
- Artifact `staybuddy-build-13c5e2e0de93170a068b1479ab7e1e444307bd78` (ID `9770662273`, 78,518,169 bytes) is retained through 7 September 2026.

The PR intentionally targets the Sprint 4 feature branch, so GitHub does not apply `main`'s independent-review rule to this intermediate stack. It must be retargeted/rebased after Sprint 4 merges and then pass protected-main review and checks.

## Exit-gate decision

Every repository-controlled Sprint 5 exit-gate behavior passes locally and in hosted CI and is release-blocking through `ci:quality`/`ci:verify`. ADR-0007 and the tenant-security runbook record the architecture, deployment identity separation, incident response, and dead-letter recovery procedure.

Sprint 5 is nevertheless **CONDITIONAL**, not complete, because this branch is intentionally stacked on the unmerged Sprint 4 implementation. It may not merge to `main` before the Sprint 4 protected review and authorized AWS dev deployment gate are satisfied. After that dependency merges, Sprint 5 must be retargeted/rebased, rerun all protected checks, and receive the required independent approval; branch protection may not be weakened.

Sprint 6 has not started. Existing Sprint 6-10 files remain provisional until their ordered source review and acceptance.
