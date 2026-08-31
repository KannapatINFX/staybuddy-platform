# Sprint 3 Acceptance Report

**Sprint:** 3 — Target Monorepo and Engineering System

**Review date:** 31 August 2026

**Status:** CONDITIONAL — implementation, local parity, and hosted CI pass; protected `main` remains unavailable on the current GitHub plan

**Next sprint:** Not authorized

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
| CI pipeline                   | `.github/workflows/ci.yml` defines Quality, Migrations & Integration, Build Artifacts, and Secret Scan; PR #1 run `33378014800` passed all four jobs and uploaded the build artifact                          | PASS   |
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

The private repository is `KannapatINFX/staybuddy-platform`. Pull request [#1](https://github.com/KannapatINFX/staybuddy-platform/pull/1) contains the synthetic fixture proof and the clean-runner integration correction.

- Reviewed head commit: `be7fb1a463886594b593ca0dd0aef23020834d9d`.
- Passing workflow: [run 33378014800](https://github.com/KannapatINFX/staybuddy-platform/actions/runs/33378014800), triggered by `pull_request` on 31 August 2026.
- `Required / Quality`: PASS in 1m53s.
- `Required / Migrations & Integration`: PASS in 1m20s against the workflow PostgreSQL service.
- `Required / Build Artifacts`: PASS in 5m36s, including all workspace builds and successful API and worker Docker builds.
- `Required / Secret Scan`: PASS in 37s.
- Artifact `staybuddy-build-36324eb39490b9b1cad09b492437beb9250c332b` (artifact ID `9752780504`, 78,463,077 bytes) was uploaded from the GitHub-generated merge commit and retained through 7 September 2026.

The first proof run exposed that the integration command depended on locally prebuilt workspace outputs. Commit `be7fb1a` corrected the command to build the API dependency graph before integration tests; the passing run above proves the correction on a clean GitHub runner.

## Exit-gate decision

The minimal-change CI portion of the Sprint 3 exit gate is satisfied. The sole remaining gate is protected `main`.

GitHub rejected the branch-protection API request with HTTP 403: `Upgrade to GitHub Pro or make this repository public to enable this feature.` The repository is private under the current GitHub Free account, so branch protection and rulesets cannot be enabled without either upgrading the account or explicitly changing repository visibility. Repository visibility was not changed because no authorization to make the source public was given.

Sprint 3 therefore remains active and Sprint 4 must not start.

To promote Sprint 3 to COMPLETE:

1. Keep the repository private and upgrade the owner account to GitHub Pro, or explicitly authorize changing the repository to public.
2. Apply and verify the protection settings in `docs/runbooks/BRANCH_PROTECTION.md`, requiring all four passing checks.
3. Confirm PR #1 is blocked by the protection rule until its requirements are met, then merge it through the protected flow.
4. Re-run `tools/verify-sprint3-engineering-system.mjs`, change canonical status to COMPLETE, and only then make Sprint 4 next.
