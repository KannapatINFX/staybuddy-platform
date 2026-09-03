# Current Sprint

**Sprint:** 6 — Hotel Onboarding and Remote Tenant Configuration

**Status:** CONDITIONAL — implementation plus local and hosted exit gates pass; independent approval and prerequisite Sprint 4/5 gates remain

**Updated:** 3 September 2026

## Completed and verified locally

- One strict `CreateHotelInput` now creates hotel/location, encrypted primary contact, sales reference, room/commercial baseline, app identity, brand/voice/four locales, departments, initial service categories, features, configuration version 1, onboarding progress, audit, and outbox evidence in one idempotent transaction.
- Published public configuration is versioned, immutable, secret-free, atomic, auditable, and exposed through an idempotent update API.
- Mobile bootstrap resolves a hashed per-app key, pins hotel/app identity, uses Ed25519 verification, carries config/minimum-version/maintenance policy, and supports private caching with `ETag`, `Vary`, 304 revalidation, expiry, and safe cached fallback.
- Ops screens cover the live hotel directory, complete hotel creation, overview, and onboarding progress. A synthetic CC Phuket onboarding fixture and API command require no source edit.
- Migration `0005_hotel_onboarding_config.sql`, ADR-0008, the onboarding/bootstrap runbook, updated OpenAPI, and 21 release-blocking Sprint 6 controls are present.
- `pnpm ci:verify` passes against a new local PostgreSQL 17 database: five migrations, DB integration 12/12, API integration 6/6, typecheck/unit graph 21/21, builds 14/14, 15 artifact groups, two synthetic app configs, and secret scan across 201 source files.
- No AWS, Hostinger, DNS, cloud environment, deployment, or production data was accessed or changed. Terraform was only initialized without backend and statically validated as an unchanged regression gate.
- Stacked PR #4 at head `8951749` passes all four hosted checks in run `33727343769`, including clean PostgreSQL integration and both production Docker image builds.

## Remaining acceptance gates

1. Complete and merge Sprint 4, then Sprint 5, in dependency order without weakening their external deployment/review gates.
2. Retarget/rebase Sprint 6 onto protected `main`, rerun required checks, obtain independent approval, and merge.
3. Replace CC Phuket placeholder brand assets and synthetic contact values with approved production inputs only through an authorized onboarding run; this is not required for the synthetic Sprint 6 exit test.

The repository-controlled local and hosted Sprint 6 exit gates pass. Sprint 7 has not started.
