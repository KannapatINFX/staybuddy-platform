# Current Sprint

**Sprint:** 8 — Reservation Ingestion and Stay Preparation

**Status:** CONDITIONAL — implementation and full local exit gate pass; dependency, protected-main, and hosted-PR gates remain

**Updated:** 4 September 2026

## Completed and verified locally

- Vendor-neutral canonical reservation DTO and adapter SDK support source identity/version, guest contact/language, dates/timezone, rooms, booking source, and provenance.
- CSV import supports inline or saved versioned mapping, server-owned encrypted preview, validation/rejection preview, commit, history, detail, retry lineage, and manual fallback.
- Commit reparses the encrypted source and never trusts normalized rows returned by a browser. Preview is tenant-bound, expires after 24 hours, and can be committed once.
- Row outcomes are deterministic: `CREATED`, `UPDATED`, `UNCHANGED`, and `CONFLICTED`. Conflicts and invalid rows are isolated without rolling back valid upcoming stays.
- Manual entry forces `MANUAL` provenance and server time; clients cannot impersonate a connector.
- Hotel APIs expose upcoming reservations, reservation provenance, mapping profiles, batch history/rejections, retry, and health. Ops receives read-only cross-hotel health under platform RLS.
- Hotel Admin covers `SB-H-003`, `SB-H-006`, `SB-H-007`, `SB-H-009`, and `SB-H-077`–`SB-H-080`. Ops covers `SB-O-012`, `SB-O-036`, and `SB-O-038`–`SB-O-041`.
- ADR-0010, the operations runbook, updated OpenAPI, migration `0007`, and 16 release-blocking Sprint 8 controls are present.
- `pnpm ci:verify` passes against a new PostgreSQL 17 database: seven migrations, DB integration 12/12, API integration 7/7, production builds, 15 artifact groups, and secret scan.
- No AWS, Hostinger, DNS, deployment, EAS cloud build, stores, or production data was accessed or changed.

## Remaining acceptance gates

1. Commit and push the stacked branch, open/update its pull request, and pass all four hosted required checks.
2. Complete Sprint 4→5→6→7 dependency merges, then retarget/rebase Sprint 8 onto protected `main`, rerun checks, obtain independent approval, and merge.
3. Before production, configure preview retention cleanup, operational alerts, and real hotel mapping/source data.

The repository-controlled local Sprint 8 exit gate passes. Sprint 9 has not started.
