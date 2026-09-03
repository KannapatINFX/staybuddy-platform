# Sprint 6 Acceptance Report

**Sprint:** 6 — Hotel Onboarding and Remote Tenant Configuration  
**Review date:** 3 September 2026  
**Status:** CONDITIONAL — implementation plus full local and hosted exit gates pass; dependency and protected-main gates remain
**Next sprint:** Sprint 7 — not started

## Source reviewed

- `../../agent.md` and `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`.
- Product & Business Reference hotel/app/commercial configuration rules.
- Final End-to-End Flow hotel onboarding, content/config, integration, billing, notification, information architecture, pilot scenarios, and non-negotiables.
- Developer Blueprint tenant isolation, app factory/bootstrap, data model, RBAC/security, API/idempotency/outbox, and mobile cache requirements.
- Screen Inventory `SB-O-003` through `SB-O-016`, with implementation focus on the Sprint 6 initial Ops screens `SB-O-003` through `SB-O-009`.
- Phase 0 API/schema map, domain/event catalog, Phase 0 boundary, and ADR-0001 through ADR-0008.

## Deliverable assessment

| Deliverable                   | Evidence                                                                                                                                                   | Result |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Complete onboarding API       | Strict shared contract, idempotent atomic creation, hotel/location/contact/sales/app/brand/commercial/department/service/feature persistence, audit/outbox | PASS   |
| PII safety                    | AES-256-GCM contact fields, hotel-scoped email HMAC, authorized detail read, bootstrap exclusion and encrypted-storage integration assertions              | PASS   |
| Onboarding progress           | Durable 13-step checklist; tenant, brand/app, department, and initial service setup complete while later owning-sprint work remains pending                | PASS   |
| Remote configuration          | Immutable append-only versions, atomic active pointer, config v1→v2 integration coverage, `hotel.config.updated` audit/event                               | PASS   |
| Signed bootstrap              | Ed25519 signature, compiled hotel/app pin, no reflected installation key, config version, maintenance/minimum-version policy, expiry                       | PASS   |
| Cache behavior                | Stable five-minute signature bucket, private max-age/stale-if-error, tenant/app-version `Vary`, ETag and 304 integration coverage                          | PASS   |
| Initial Ops screens           | Live directory, complete create form, overview, onboarding checklist, contact/app/department/service summaries                                             | PASS   |
| CC Phuket fixture             | Validated full synthetic onboarding JSON plus bearer-authenticated CLI command; no source edit required                                                    | PASS   |
| Contract and release controls | Updated OpenAPI and error schemas, migration/RLS coverage, 21 Sprint 6 structural controls in `ci:quality`                                                 | PASS   |

## Reproducible local evidence

The following passed against a newly initialized local PostgreSQL 17 database on 3 September 2026:

```bash
CI=true DATABASE_URL='<fresh-postgres-url>' REDIS_URL='<local-test-url>' pnpm ci:verify
```

Observed evidence:

- Five forward migrations applied from empty state, including `0005_hotel_onboarding_config.sql`; migration policy and concurrency checks pass.
- Sprint 6 verifier passes 21 controls; Sprint 4 and Sprint 5 regression verifiers pass 32 and 27 controls.
- PostgreSQL integration passes 12/12 tenant/RLS/idempotency/audit/outbox cases with the new tenant tables included in the policy matrix.
- API integration passes 6/6 end-to-end groups, including safe validation failure, complete two-hotel isolation, exact idempotent replay and mismatch rejection, encrypted contact persistence, config v1→v2, signature verification, app-key exclusion, minimum-version blocking, cache headers, ETag/304, and immutable version rejection. Contract tests reject signature tampering.
- Typecheck and unit graphs pass 21/21 tasks; production build passes 14/14 workspaces and 15 artifact groups.
- OpenAPI drift, dependency/fixture policy, app-factory validation for two synthetic identities, unchanged Terraform static validation, and secret scan across 201 source files pass.
- No AWS, Hostinger, DNS, deployment, cloud resource, provider credential, production data, or legacy tracked file was accessed or changed.

## Hosted CI evidence

Stacked pull request [#4](https://github.com/KannapatINFX/staybuddy-platform/pull/4) at head commit `8951749577229f909fd1a12cd515c66735103deb` passed all four checks in [run 33727343769](https://github.com/KannapatINFX/staybuddy-platform/actions/runs/33727343769) on 3 September 2026:

- `Required / Secret Scan`: PASS in 44s.
- `Required / Migrations & Integration`: PASS in 1m14s against clean PostgreSQL/Redis services.
- `Required / Quality`: PASS in 1m40s, including all 21 Sprint 6 controls and prior regression gates.
- `Required / Build Artifacts`: PASS in 3m24s, including API and worker production Docker builds.
- Artifact `staybuddy-build-6022621634b629dac3dd402fcda8d91f17b5df48` (ID `9882564426`, 79,477,759 bytes) is retained through 10 September 2026.

The run's artifact/image tag uses GitHub's pull-request merge SHA; the reviewed feature-branch head remains the commit shown above. This PR intentionally targets the Sprint 5 branch and does not invoke the deployment workflow.

## Exit-gate decision

The local repository-controlled Sprint 6 exit gate passes: Ops can create a complete synthetic hotel configuration and retrieve a signed, cacheable, tenant-pinned mobile bootstrap without editing source. Later onboarding steps intentionally remain pending because reservation mapping, knowledge, automation, billing, build, UAT, publish, pilot, and live behavior belong to later ordered sprints.

Sprint 6 remains **CONDITIONAL**, not complete, because the Sprint 4→5→6 dependency chain must still merge through protected `main` with independent approval and rerun required checks after retarget/rebase. No hosting or deployment action is part of this Sprint 6 change.
