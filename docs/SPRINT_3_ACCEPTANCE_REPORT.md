# Sprint 3 Acceptance Report

**Sprint:** 3 — Target Monorepo and Engineering System

**Review date:** 31 August 2026

**Status:** COMPLETE — implementation, local parity, hosted CI, build artifact, and protected `main` verified

**Next sprint:** Sprint 4 — not started

## Source reviewed

- `../../agent.md` canonical project brain and precedence rules.
- `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`, Sprint 3 deliverables and exit gate.
- `../../Code Aug/StayBuddy_Developer_Blueprint_v1_0_2026-08-28.md`, technical baseline, repository/delivery model, runtime components, migration rules, tenant-security test requirement, and test pyramid.
- ADR-0001 through ADR-0004.

## Deliverable assessment

| Deliverable                   | Evidence                                                                                                                                                                                                      | Result |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Target monorepo               | 4 apps, 2 services, 8 shared packages; pnpm/Turbo graph validates all 14 names and required scripts                                                                                                           | PASS   |
| Engineering quality system    | Prettier, ESLint, strict TypeScript, 24 unit assertions across all 14 workspaces, 6 PostgreSQL/API integration cases, OpenAPI generation/drift, fixture, dependency, migration, artifact, and secret policies | PASS   |
| CI pipeline                   | `.github/workflows/ci.yml` defines Quality, Migrations & Integration, Build Artifacts, and Secret Scan; PR #1 run `33378806879` passed all four jobs and uploaded the build artifact                          | PASS   |
| ADR/runbook/fixture structure | Canonical ADR ledger plus target ADR index, dependency policy, foundation and branch-protection runbooks, decision log, current sprint record, synthetic fixture policy and fixture                           | PASS   |

## Reproducible local evidence

The following completed successfully against a disposable local PostgreSQL database on 31 August 2026:

```bash
CI=true pnpm install --frozen-lockfile
CI=true DATABASE_URL=postgresql://localhost:55432/staybuddy_test pnpm ci:verify
```

Observed evidence:

- Formatting and lint: pass with zero warnings.
- Workspace dependency policy: 14 workspaces and 46 external packages pass.
- Synthetic fixture policy: 1 fixture passes.
- OpenAPI: generated artifact matches source; 4 contract assertions pass.
- Typecheck: 21/21 Turbo tasks pass across all 14 workspaces.
- Unit test graph: 21/21 Turbo tasks pass; 24 assertions pass and no workspace uses an empty-test bypass.
- Migration policy: 3 sequential forward migrations pass and apply successfully to a fresh database.
- Integration: database 3/3 and API 3/3 pass, including Hotel A/Hotel B isolation coverage already present in the provisional implementation.
- Build: 14/14 workspace builds pass, including Expo iOS/Android/web export and all three Next.js portals.
- Artifact validation: all 15 required output groups exist.
- API and worker production deploy layouts build successfully through the same pnpm deploy commands used by their Dockerfiles.
- App-factory structural validation: 2 synthetic tenants are valid.
- Source secret scan: pass.

The local machine did not have a Docker daemon, so the two container builds are defined in the Build Artifacts CI job but are not claimed as locally executed in this review.

## Hosted CI evidence

The public repository is `KannapatINFX/staybuddy-platform`. Pull request [#1](https://github.com/KannapatINFX/staybuddy-platform/pull/1) contains the synthetic fixture proof, clean-runner integration correction, and final Sprint 3 evidence.

- Reviewed head commit before final acceptance documentation: `eeb2420c97553278415c321deed603d8df98b90c`.
- Passing workflow: [run 33378806879](https://github.com/KannapatINFX/staybuddy-platform/actions/runs/33378806879), triggered by `pull_request` on 31 August 2026.
- `Required / Quality`: PASS in 1m48s.
- `Required / Migrations & Integration`: PASS in 1m09s against the workflow PostgreSQL service.
- `Required / Build Artifacts`: PASS in 5m42s, including all workspace builds and successful API and worker Docker builds.
- `Required / Secret Scan`: PASS in 37s.
- Artifact `staybuddy-build-303669d4ace320a56d904945e377e619c83a4459` (artifact ID `9753077966`, 78,462,612 bytes) was uploaded from the GitHub-generated merge commit and retained through 7 September 2026.

The first proof run exposed that the integration command depended on locally prebuilt workspace outputs. Commit `be7fb1a` corrected the command to build the API dependency graph before integration tests; the passing run above proves the correction on a clean GitHub runner.

## Exit-gate decision

The owner explicitly authorized public visibility on 31 August 2026. The repository was changed to public and `main` branch protection was applied with strict/up-to-date status checks, the four exact required contexts, pull-request-only changes, stale-review dismissal, conversation resolution, linear history, administrator enforcement, and force-push/deletion disabled.

PR #1 was used as the single-maintainer bootstrap proof. Approval count was temporarily zero while all other protection requirements were enforced; while its final checks were pending GitHub reported the PR as blocked. After all four checks passed, the PR was merged through the protected flow and the final rule was raised to one required approval for future pull requests.

Sprint 3 is complete. Sprint 4 is next in sequence but has not started.
