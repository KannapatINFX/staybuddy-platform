# Sprint 8 Acceptance Report

**Sprint:** 8 — Reservation Ingestion and Stay Preparation  
**Review date:** 4 September 2026  
**Status:** CONDITIONAL — implementation and full local exit gate pass; dependency, protected-main, and hosted-PR gates remain

**Next sprint:** Sprint 9 — not started

## Source reviewed

- Root `agent.md`, master execution plan, and accepted Sprint 7 record.
- Product & Business Reference fallback and vendor-neutral onboarding rules.
- Final End-to-End Flow normalization, Upcoming Stay, locale priority, and arrivals behavior.
- Developer Blueprint canonical reservation, adapter, idempotency, conflict ownership, CSV/manual fallback, health, retry, audit, RLS, and failure isolation.
- Design System actionable-exception and accessible-status rules.
- Screen Inventory `SB-H-003`, `SB-H-006`, `SB-H-007`, `SB-H-009`, `SB-H-077`–`SB-H-080`, `SB-O-012`, `SB-O-036`, `SB-O-038`–`SB-O-041`, `ST-018`, and `ST-020`.

## Deliverable assessment

| Deliverable          | Evidence                                                                                                                                                   | Result |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Canonical adapter    | DTO and PMS SDK retain source identity/version, guest, locale, dates, timezone, rooms, booking source, validation, normalization, capabilities, and health | PASS   |
| Trusted preview      | Tenant-bound encrypted source staging, hash, 24-hour expiry, single commit, and server reparse prevent client tampering                                    | PASS   |
| Mapping/fallback     | Inline mapping, saved/versioned mapping, reuse, CSV preview/commit, and server-owned MANUAL provenance                                                     | PASS   |
| Predictable outcomes | Clean create, exact duplicate, newer update, stale/equal conflict, partial rejection, and idempotent replay have distinct behavior                         | PASS   |
| History/recovery     | Immutable batch history, safe rejection detail, linked retry, mapping/source provenance, and reservation detail                                            | PASS   |
| Stay preparation     | Accepted reservations create or retain `UPCOMING` stays; conflict never deletes historical stay state                                                      | PASS   |
| Boundaries           | Hotel RLS, cross-tenant preview rejection, and read-only Support/Super Admin aggregate health                                                              | PASS   |
| Product surfaces     | Hotel and Ops routes cover all Sprint 8 screen IDs with text-labelled health/action states                                                                 | PASS   |
| Release controls     | Migration `0007`, OpenAPI, ADR-0010, runbook, DB policy matrix, and 16 Sprint 8 controls in `ci:quality`                                                   | PASS   |

## Reproducible local evidence

```bash
CI=true DATABASE_URL='<fresh-postgres-url>' REDIS_URL='<local-test-url>' pnpm ci:verify
```

- Seven migrations applied from empty state; migration policy passed.
- Sprint 8 verifier passed 16 controls; Sprint 4–7 regression verifiers passed.
- PostgreSQL integration passed 12/12, including tenant policy coverage for encrypted previews.
- API integration passed 7/7. Reservation evidence covers create, replay, duplicate, update, stale conflict, partial rejection, retry, saved mapping, tamper rejection, cross-tenant rejection, forced manual provenance, and Support health.
- Typecheck/unit graphs, Hotel/Ops/mobile/API/worker builds, 15 artifacts, OpenAPI drift, dependency/fixture policy, Terraform static validation, and secret scan passed.
- No AWS, Hostinger, DNS, deployment, EAS cloud build, signing credential, store, production data, or legacy tracked file was changed.

## Exit-gate decision

The local Sprint 8 exit gate passes: clean, duplicate, updated, stale-conflicted, and partially rejected CSV inputs behave predictably; valid rows create upcoming stays; mappings are reusable; retry history is retained; manual entry cannot spoof connector provenance; Hotel and Ops can see actionable state.

Sprint 8 remains **CONDITIONAL** until its stacked pull request passes hosted checks and the dependency/protected-main approval path completes. This sprint does not authorize hosting, cloud deployment, or production ingestion.
