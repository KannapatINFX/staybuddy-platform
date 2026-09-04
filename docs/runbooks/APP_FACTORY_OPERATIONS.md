# App Factory Operations

## Scope

This runbook covers the Sprint 7 code-only white-label factory: validated tenant profiles, local synthetic Expo exports, build configuration, queue/status APIs, and Ops screens `SB-O-017` through `SB-O-020`. It does not authorize AWS, Hostinger, DNS, EAS cloud builds, signing-key access, App Store/Play submission, or public install-link activation.

## Validate tenant build sources

Run `pnpm app-factory:validate`. The command checks:

- unique hotel/app IDs, app installation keys, iOS bundle IDs, Android packages, schemes, universal-link hosts, and install URLs;
- required EN/TH/ZH-CN/RU store metadata;
- icon/adaptive-icon 1024×1024 dimensions, minimum splash dimensions, and exact SHA-256 hashes;
- HTTPS deep/install links and allowed routes with no tenant selector;
- no secret/private/token field names in public build configuration.

`APP_FACTORY_PROFILE=production pnpm app-factory:validate` must fail while assets or URLs remain synthetic. Never bypass this result; replace inputs through reviewed configuration and record `APPROVED` only after brand/legal review.

## Generate and export a preview

- Generate one reviewable profile: `pnpm app-factory:profile <tenant-slug> preview artifacts/app-factory/<tenant-slug>.json`.
- Export both synthetic apps: `pnpm app-factory:export:synthetic`.
- Compare `artifacts/apps/*/build-profile.json`. Bundle ID, Android package, scheme, universal-link host, install URL, hotel ID, and app ID must be distinct.
- Confirm both output directories contain iOS, Android, and web bundles. These are local static/JS exports, not signed native binaries and not store submissions.

## Configure and queue through Ops

1. Open `/app-factory` with an authorized `STAYBUDDY_APP_OPS` or super-admin session.
2. Open one hotel app (`SB-O-018`) and save a configuration whose scheme matches the compiled app identity. A changed scheme is rejected.
3. Open `/app-builds` (`SB-O-019`) and queue an iOS or Android job with hotel ID, hotel app ID, semantic version, profile, and source commit SHA. Every mutation uses a new idempotency key.
4. A second active job for the same app/platform lane is rejected as `APP_BUILD_LANE_BUSY`; another hotel's lane remains available.
5. Open build detail (`SB-O-020`) and progress only through `QUEUED -> VALIDATING -> BUILDING -> BUILT`, or terminate as `FAILED`/`CANCELLED`. A built result needs an artifact reference; a failed result needs a stable failure code.
6. Review append-only events, audit log, and `app.build.status_changed` outbox evidence. Do not edit database status directly.

## Recovery

- Correct the underlying configuration or source, then queue a new build. Never reopen a terminal job.
- If a request times out, retry with the same idempotency key and identical body. A changed body with the same key is rejected.
- If one hotel fails, keep unrelated lanes running. Escalate only the affected hotel/build with its build ID, commit SHA, config version, failure code, and event history.
- Production publishing remains blocked until approved assets, real privacy/support/install domains, secure signing/provider credentials, smoke tests, and later app-publishing acceptance gates are in place.
