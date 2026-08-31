# Sprint 3 Acceptance Report

**Sprint:** 3 — Target Monorepo and Engineering System

**Review date:** 31 August 2026

**Status:** CONDITIONAL — implementation and local CI parity pass; hosted CI exit gate not yet proven

**Next sprint:** Not authorized

## Source reviewed

- `../../agent.md` canonical project brain and precedence rules.
- `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`, Sprint 3 deliverables and exit gate.
- `../../Code Aug/StayBuddy_Developer_Blueprint_v1_0_2026-08-28.md`, technical baseline, repository/delivery model, runtime components, migration rules, tenant-security test requirement, and test pyramid.
- ADR-0001 through ADR-0004.

## Deliverable assessment

| Deliverable                   | Evidence                                                                                                                                                                                                      | Result                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Target monorepo               | 4 apps, 2 services, 8 shared packages; pnpm/Turbo graph validates all 14 names and required scripts                                                                                                           | PASS                            |
| Engineering quality system    | Prettier, ESLint, strict TypeScript, 24 unit assertions across all 14 workspaces, 6 PostgreSQL/API integration cases, OpenAPI generation/drift, fixture, dependency, migration, artifact, and secret policies | PASS                            |
| CI pipeline                   | `.github/workflows/ci.yml` defines Quality, Migrations & Integration, Build Artifacts, and Secret Scan; build outputs and API/worker Dockerfiles are gated                                                    | IMPLEMENTED; HOSTED RUN PENDING |
| ADR/runbook/fixture structure | Canonical ADR ledger plus target ADR index, dependency policy, foundation and branch-protection runbooks, decision log, current sprint record, synthetic fixture policy and fixture                           | PASS                            |

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

## Exit-gate decision

The Sprint 3 exit gate is not yet satisfied because the target repository has no commit or remote and therefore no hosted GitHub Actions run exists. Sprint 3 remains active and Sprint 4 must not start.

To promote Sprint 3 to COMPLETE:

1. Obtain authorization for the GitHub owner and private repository destination.
2. Create the initial reviewed commit and push `main`.
3. Apply the protection settings in `docs/runbooks/BRANCH_PROTECTION.md`.
4. Open a minimal fixture-only pull request and record its commit SHA, workflow URL, four passing checks, and build artifact in this report.
5. Re-run `tools/verify-sprint3-engineering-system.mjs`, change canonical status to COMPLETE, and only then make Sprint 4 next.
