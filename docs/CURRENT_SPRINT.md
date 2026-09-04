# Current Sprint

**Sprint:** 7 — White-Label App Factory Baseline

**Status:** CONDITIONAL — implementation and local exit gate pass; hosted, dependency, protected-main, approved-asset, and signed-native-build gates remain

**Updated:** 4 September 2026

## Completed and verified locally

- One Expo mobile codebase now compiles strict hotel-pinned app identity, icon/splash assets, universal/app links, installation key, and four-locale store metadata.
- Two synthetic hotel apps export successfully for iOS, Android, and web with distinct identifiers, schemes, hosts, assets, and generated build profiles.
- Runtime bootstrap and local cache remain signed and tenant/app pinned, support ETag/304, and reject cross-hotel or expired fallback.
- Deep-link handling rejects another hotel's host, tenant overrides, unknown routes, and hotel-selector behavior.
- App Factory contracts, migration `0006`, deterministic build state machine, one-active-lane rule, append-only status events, idempotency, audit/outbox, and isolated worker failure handling are implemented.
- `STAYBUDDY_APP_OPS` is verified end to end with narrowly scoped RLS; Support can read build detail but cannot queue or mutate builds.
- Ops screens cover App Factory dashboard/configuration and build queue/detail/history (`SB-O-017` through `SB-O-020`).
- ADR-0009, the App Factory operations runbook, updated OpenAPI, and 22 release-blocking Sprint 7 controls are present.
- `pnpm ci:verify` passes against a new local PostgreSQL 17 database: six migrations, DB integration 12/12, API integration 7/7, production builds, 15 artifact groups, two validated synthetic app identities, and secret scan.
- Production validation intentionally blocks synthetic assets. No AWS, Hostinger, DNS, EAS cloud build, signing, store, deployment, or production data was accessed or changed.

## Remaining acceptance gates

1. Create the stacked Sprint 7 pull request against Sprint 6 and pass all required hosted checks.
2. Complete and merge Sprints 4, 5, and 6 in dependency order; retarget/rebase Sprint 7 onto protected `main`, rerun required checks, obtain independent approval, and merge.
3. Replace synthetic assets, placeholder domains, and store/legal metadata with approved production inputs; provision signing credentials through the later authorized publishing workflow.
4. Produce signed iOS/Android binaries and complete native-device, deep-link, install-link, and store-readiness QA before any hotel app can ship.

The repository-controlled local Sprint 7 exit gate passes. Sprint 8 has not started.
