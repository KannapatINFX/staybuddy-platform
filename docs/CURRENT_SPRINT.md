# Current Sprint

**Sprint:** 5 — Core Database, Tenant Boundary, Audit, Outbox, and Idempotency

**Status:** CONDITIONAL — implementation plus local and hosted exit gates pass; independent approval and the Sprint 4 dependency gate remain

**Updated:** 1 September 2026

## Completed and verified locally

- RDS migration ownership (`staybuddy_migrator`) is separated from the non-owner runtime login (`staybuddy_runtime`) and scoped no-login tenant/platform roles; API and worker never receive the RDS master username or password.
- Tenant and platform transactions always assume an explicit role and set trusted actor, hotel, trace, correlation, and department context. Business services no longer use owner-level direct pool queries.
- PostgreSQL validates active platform identities/grants and active staff identities/hotel memberships. Token or debug claims cannot elevate hotel, role, or department authority; debug auth is test-only.
- Explicit RLS policies cover every current tenant table, cross-tenant foreign keys include `hotel_id`, and platform authenticator/resolver/support/system access is constrained by policy.
- Tenant and platform mutations support persisted request fingerprints and deterministic replay. Material platform mutations write append-only audit and immutable outbox facts atomically.
- The worker relays platform events separately and hotel events tenant by tenant, publishes with a deduplicating event job ID, reclaims expired leases, retries exponentially, and exposes terminal dead letters.
- `pnpm ci:verify` passes from a fresh PostgreSQL 17 database: four migrations, 27 Sprint 5 controls, 32 Sprint 4 controls, 12/12 database integration tests, 5/5 API integration groups, 21/21 typecheck and unit graphs, 14/14 builds, 15 artifact groups, and secret scanning.
- ADR-0007 and `TENANT_SECURITY_OPERATIONS.md` define role separation, principal validation, RLS incident handling, password rotation, monitoring, and dead-letter recovery.
- Stacked PR #3 passes all four hosted checks, including clean PostgreSQL integration and both production Docker image builds.

## Remaining acceptance gates

1. Complete Sprint 4 first: obtain its independent approval, authorize/configure AWS dev, and retain the CI deployment, PostgreSQL health, service stability, and matching X-Ray evidence.
2. Rebase/retarget Sprint 5 after Sprint 4 merges and rerun all four checks against protected `main`.
3. Obtain the independent approval required by protected `main`, then merge in dependency order; do not weaken branch protection.

The repository-controlled Sprint 5 exit gate passes locally and in hosted CI. Sprint 5 remains conditional because the prerequisite Sprint 4 external gates and protected-main review are not yet complete. Sprint 6 has not started.
