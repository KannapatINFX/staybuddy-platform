# Sprint 1-10 Release Evidence

> **Status correction — 31 August 2026:** This file is historical/provisional implementation evidence, not the authoritative program completion record. Sprints 1-3 are accepted complete in their dedicated acceptance reports; Sprint 4 is conditionally accepted pending its external AWS dev gate; rows 5-10 remain provisional.

**Evidence date:** 30 August 2026

**Scope:** Local implementation and verification for the new `staybuddy-platform` repository

**Canonical rules:** `../../agent.md` and `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`

## Status vocabulary

- `COMPLETE`: implemented and verified within the local environment.
- `CONDITIONAL`: implementation and synthetic/local evidence are complete, but an external hosted/execution gate still requires an authorized repository, credentials, approved assets, hardware, or a cloud account.
- `PROVISIONAL`: work exists, but ordered sprint review and acceptance has not occurred.
- `NOT STARTED`: no implementation evidence exists.

## Sprint status

| Sprint | Status      | Delivered evidence                                                                                                                                                                                                                                                                                       | Remaining release gate                                                                                                                       |
| ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | COMPLETE    | Repeatable legacy audit; inventory, lineage, migration conflict, provider, disposition, and parity-test artifacts under `../../docs/migration/generated/`                                                                                                                                                | Production-data discovery remains a controlled pre-cutover activity; no production data was accessed.                                        |
| 2      | COMPLETE    | Canonical 250-screen identity/navigation contract, Phase 0 boundary, domain/entity/event and API schema maps, all 18 components/28 states, Phase 0 localization namespaces, 33 acceptance contracts, ADRs, and independent verifier under `../../docs/` and `../../tools/`                               | Accepted in `../../docs/product/SPRINT_2_COMPLETION_REPORT.md`; future source changes must update all derivatives and verification evidence. |
| 3      | COMPLETE    | Ordered local review passes; PR #1 hosted run `33378806879` passes all four GitHub jobs, clean PostgreSQL integration, both Docker builds, and artifact upload; protected `main` was enforced and verified                                                                                               | Accepted in `SPRINT_3_ACCEPTANCE_REPORT.md`; future changes must use the protected pull-request flow.                                        |
| 4      | CONDITIONAL | Ordered review complete; local `ci:verify`, 32 foundation controls, PostgreSQL migration concurrency, immutable layouts, Terraform/OIDC/ADOT/X-Ray/Sentry baseline, and PR #2 hosted run `33385277468` with both Docker builds and all four required checks pass                                         | Independent PR approval plus authorized AWS dev configuration and a CI deployment with health/X-Ray evidence remain external gates.          |
| 5      | PROVISIONAL | Tenant schema, RLS, trusted transaction context, RBAC skeleton, idempotency records, audit/outbox primitives, and Hotel A/Hotel B integration coverage                                                                                                                                                   | Must be reviewed in sequence against the Sprint 5 exit gate.                                                                                 |
| 6      | PROVISIONAL | Ops hotel creation/list APIs and screens, brand/commercial/department/feature defaults, signed Ed25519 bootstrap manifest, minimum-version and maintenance handling, and CC Phuket fixture                                                                                                               | Must be reviewed in sequence; real brand/theme/content values still require approval.                                                        |
| 7      | PROVISIONAL | Tenant config validation, distinct iOS/Android identifiers, cached signed remote theme/config, build-job foundation, and successful iOS/Android/web synthetic exports for two hotels                                                                                                                     | Must be reviewed in sequence; approved assets and signing credentials remain external gates.                                                 |
| 8      | PROVISIONAL | Canonical reservation/stay DTO, CSV parser/mapping/preview/rejection report/commit, saved mapping, manual entry, provenance, conflict handling, idempotency, arrivals query, and integration tests                                                                                                       | Must be reviewed in sequence against the Sprint 8 exit gate.                                                                                 |
| 9      | PROVISIONAL | Hotel-scoped email OTP accounts/sessions/devices, OAuth assertion verification service, encrypted email and tenant lookup hash, consent ledger, pre-arrival and Stay QR issue/scan/complete, TTL/revoke/replay protection, safe preview, push permission capture, and negative-path integration tests    | Must be reviewed in sequence; real identity, email, push credentials, and native-device QA remain external gates.                            |
| 10     | PROVISIONAL | Hotel-branded Expo shell, canonical five-tab navigation, lifecycle home variants, global inbox/profile/concierge access, EN/TH/ZH-CN/RU parity, locale switch, signed theme, loading/offline/empty/validation/permission/update/maintenance states, accessibility sizing, and synthetic platform exports | Must be reviewed in sequence; approved assets and final iOS/Android device QA remain external gates.                                         |

## Verification record

The following commands passed on 30 August 2026:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
DATABASE_URL=postgresql://localhost:55432/staybuddy_test pnpm test:integration
pnpm build
pnpm app-factory:validate
pnpm app-factory:export:synthetic
pnpm --filter @staybuddy/mobile exec expo install --check
terraform -chdir=infra/terraform fmt -check -recursive
terraform -chdir=infra/terraform validate
```

Observed results:

- Typecheck: 21/21 Turbo tasks passed.
- Build: 14/14 workspace packages passed.
- Source unit tests: 16 assertions passed across contracts, localization, domain, database, PMS SDK, and concierge packages; packages with no behavioral source yet report no tests by design.
- PostgreSQL integration: 3/3 database tests passed.
- API integration: 3/3 end-to-end scenario groups passed, including cross-tenant access, idempotent reservation replay, localized onboarding data, OTP, required consent, pre-arrival, QR replay/expiry, and declined push.
- Expo: 20 routes exported for iOS, Android, and web; two synthetic tenant exports completed with different package identities.
- Terraform: formatting and configuration validation passed with Terraform 1.16.0.
- Browser visual QA: Russian stress copy rendered at 390x844 with `documentWidth=viewportWidth`, zero horizontal overflow, and zero clipped text containers.

## Known non-blocking dependency warnings

`expo install --check` reports that project dependencies are current. pnpm may still surface upstream Expo SDK 57 peer-range warnings involving `react-native-worklets` and Metro; the project does not override Expo's checked dependency set, and all iOS/Android/web exports pass.

## Production release blockers

The local baseline is not authorization to serve real guests. Before production or pilot release, the owner must supply or approve:

1. AWS account/environment, Terraform backend, domain, and ACM certificate.
2. Expo/EAS, Apple Developer, Google Play, Apple Sign In, Google OAuth, APNs/FCM, and transactional email credentials.
3. Final hotel identity, icons, splash, store content, privacy URLs, screenshots, and signing keys.
4. Native iOS/Android device-matrix QA, accessibility QA, and signed binary smoke tests.
5. Restore drill, alert routing, security review, and the later Phase 0 release gates defined in `agent.md`; Sprint 11-28 capabilities are not implied by this historical implementation record.
