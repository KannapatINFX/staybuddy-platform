# Sprint 7 Acceptance Report

**Sprint:** 7 — White-Label App Factory Baseline  
**Review date:** 4 September 2026  
**Status:** CONDITIONAL — implementation and full local exit gate pass; hosted, dependency, protected-main, approved-asset, and signed-native-build gates remain  
**Next sprint:** Sprint 8 — not started

## Source reviewed

- `../../agent.md` and `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`.
- Product & Business Reference one-hotel-one-app, branding, commercial, link, locale, and ownership rules.
- Final End-to-End Flow onboarding, App Factory, configuration, publishing, information architecture, pilot, security, and non-negotiable rules.
- Developer Blueprint app factory, tenant resolution, mobile bootstrap/cache, build operations, RBAC/RLS, idempotency, outbox, audit, and delivery requirements.
- Screen Inventory `SB-O-017` through `SB-O-023`, with Sprint 7 implementation focused on baseline screens `SB-O-017` through `SB-O-020`.
- Phase 0 boundary, API/schema map, domain/event catalog, acceptance contracts `AC-APP-01` and `AC-BLD-01`, ADR-0001 through ADR-0009, and the Sprint 6 acceptance record.

## Deliverable assessment

| Deliverable                   | Evidence                                                                                                                                                                                        | Result |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Compiled app identity         | Strict tenant profiles compile unique app name, iOS bundle ID, Android package, custom scheme, link host, installation key, icon, adaptive icon, and splash from one codebase                   | PASS   |
| Asset and store validation    | SHA-256 and PNG dimensions, required four-locales metadata, unique identifiers/links, secret-field rejection, and production fail-closed checks                                                 | PASS   |
| Expo profile and build proof  | Reviewable generated profiles plus successful iOS, Android, and web exports for CC Phuket Residence and Andaman Bay synthetic apps                                                              | PASS   |
| Tenant pinning                | Runtime bootstrap verifies compiled hotel/app identity; deep-link resolver rejects another hotel's host, tenant override parameters, unknown routes, and selector behavior                      | PASS   |
| Safe remote configuration     | Signed Sprint 6 bootstrap retained; app-scoped local cache now supports ETag/304 reuse and only verified, matching, unexpired fallback                                                          | PASS   |
| Deep/install-link contract    | Per-hotel scheme, universal-link origin, install URL, and allowed routes are shared contracts and compile into iOS associated domains and Android intent filters                                | PASS   |
| Build lifecycle               | Deterministic `QUEUED -> VALIDATING -> BUILDING -> BUILT` state machine with terminal failed/cancelled branches, active-lane exclusion, immutable event history, audit, outbox, and idempotency | PASS   |
| Independent hotel lanes       | API and worker tests prove Hotel A can fail while Hotel B reaches `BUILT`; one job's exception does not escape into sibling work                                                                | PASS   |
| Least privilege               | `STAYBUDDY_APP_OPS` can configure and operate only App Factory scopes; Support can read build detail but cannot queue; narrow RLS covers command evidence                                       | PASS   |
| Ops foundation                | App Factory dashboard/configuration and build queue/detail/history pages implement `SB-O-017` through `SB-O-020`                                                                                | PASS   |
| Contract and release controls | Migration `0006`, OpenAPI, runbook, ADR-0009, and 22 Sprint 7 structural controls are included in `ci:quality`                                                                                  | PASS   |

## Reproducible local evidence

The following passed against a newly initialized local PostgreSQL 17 database on 4 September 2026:

```bash
CI=true DATABASE_URL='<fresh-postgres-url>' REDIS_URL='<local-test-url>' pnpm ci:verify
pnpm app-factory:export:synthetic
```

Observed evidence:

- Six forward migrations apply from empty state, including `0006_white_label_app_factory.sql`; migration policy and concurrent runner checks pass.
- Sprint 7 verifier passes 22 controls; Sprint 4, Sprint 5, and Sprint 6 regression verifiers pass 32, 27, and 21 controls.
- PostgreSQL integration passes 12/12 tenant/RLS/idempotency/audit/outbox cases with `app_build_status_events` included in the tenant policy matrix.
- API integration passes 7/7 end-to-end groups. The App Factory group uses a real `STAYBUDDY_APP_OPS` principal, verifies Support read/no-mutate behavior, preserves append-only history, rejects a terminal rewrite, and proves independent Hotel A/Hotel B outcomes.
- Typecheck and unit graphs, production workspace builds, 15 artifact groups, OpenAPI drift, dependency/fixture policy, unchanged Terraform static validation, and secret scanning pass.
- Both tenant exports render 20 routes for iOS, Android, and web. CC Phuket compiles as `com.staybuddy.ccphuketresidence`, `ccphuket`, and `cc-phuket.example.invalid`; Andaman Bay compiles as `com.staybuddy.andamanbaydemo`, `andamanbay`, and `andaman-bay.example.invalid`.
- Production validation intentionally rejects both synthetic profiles with `PRODUCTION_ASSETS_NOT_APPROVED`; no placeholder can be promoted by changing only the build profile.
- No AWS, Hostinger, DNS, deployment, EAS cloud build, signing credential, App Store, Google Play, production data, or legacy tracked file was accessed or changed.

## Hosted CI evidence

Pending creation and completion of the stacked Sprint 7 pull request. The pull request must target the Sprint 6 branch so it cannot bypass prerequisite acceptance.

## Exit-gate decision

The repository-controlled Sprint 7 exit gate passes locally: two synthetic hotel apps build from one codebase with distinct native and link identities, and neither configuration, navigation, bootstrap, nor deep-link input can switch tenant in-app. A failure in one hotel's build lane does not block another hotel.

Sprint 7 remains **CONDITIONAL**, not complete. Hosted CI evidence, the ordered Sprint 4→5→6→7 merge path, protected-main independent approval, approved production brand/legal assets, real signing credentials, and signed native binary/device verification remain required before a production app release. This sprint does not authorize or perform hosting, cloud deployment, EAS execution, or store submission.
