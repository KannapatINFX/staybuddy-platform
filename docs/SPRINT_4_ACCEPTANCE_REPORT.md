# Sprint 4 Acceptance Report

**Sprint:** 4 — Environments, Infrastructure, and Observability Baseline

**Review date:** 1 September 2026

**Status:** CONDITIONAL — implementation and local parity pass; protected PR approval and authorized AWS dev deployment remain external

**Next sprint:** Sprint 5 — not started

## Source reviewed

- `../../agent.md`, including precedence, target architecture, Definition of Done, release gates, and decision protocol.
- `../../STAYBUDDY_MASTER_EXECUTION_PLAN.md`, Sprint 4 goal, deliverables, dependencies, and exit gate.
- `../../Code Aug/StayBuddy_Developer_Blueprint_v1_0_2026-08-28.md`, environment, AWS, delivery, observability, recovery, and performance contracts.
- ADR-0001 through ADR-0005.

## Deliverable assessment

| Deliverable               | Evidence                                                                                                                                                                                                   | Result                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Reproducible environments | Environment-qualified Terraform and dev/staging/production examples; production runtime mode separated from deployment environment; local PostgreSQL/Redis compose stack uses synthetic data only          | PASS locally                   |
| AWS baseline              | Two-AZ VPC, private ECS services, HTTPS ALB/WAF, RDS encryption/managed secret/backups/production Multi-AZ, encrypted Redis, private versioned S3/CloudFront, rotating KMS, immutable ECR, logs and alarms | PASS validate                  |
| Secret policy             | Application secret is external customer-KMS-encrypted JSON; Terraform/GitHub carry ARNs only; ECS execution role reads only named secret/key resources                                                     | PASS locally                   |
| Safe release              | Workspace dependencies are injected into isolated pnpm deploy layouts; immutable SHA images; migration prerequisite containers with PostgreSQL advisory lock; ECS circuit breaker rollback                 | PASS locally                   |
| Observability             | API/worker preload OTel; X-Ray ID generation; OTLP/ADOT export; HTTP/job propagation; response trace/correlation headers; Sentry error-only baseline without default PII                                   | PASS locally                   |
| CI deployment             | Manual OIDC workflow validates Terraform, bootstraps ECR, reuses immutable tags, applies a saved plan, waits for ECS, verifies PostgreSQL health and requires a matching X-Ray trace                       | IMPLEMENTED; cloud run pending |

## Reproducible local evidence

The following completed successfully on 31 August 2026:

```bash
CI=true pnpm install --frozen-lockfile
pnpm infra:check
pnpm foundation:check
CI=true DATABASE_URL=postgresql://staybuddy@localhost:55432/staybuddy_test pnpm ci:verify
pnpm --filter @staybuddy/api deploy --prod <temporary-api-directory>
pnpm --filter @staybuddy/worker deploy --prod <temporary-worker-directory>
```

Observed evidence:

- Terraform 1.16.0 formatting/init-without-backend/validation passes using AWS provider 6.62.0.
- The independent Sprint 4 verifier passes 32 infrastructure, deployment, packaging, and observability controls.
- Typecheck and unit graphs pass 21/21 tasks across all 14 workspaces; observability has four focused assertions and worker propagation has one focused assertion.
- Fresh migration applies all three forward files. Database integration passes four cases, including two concurrent migration runners, and API integration passes four end-to-end groups, including database-backed health and safe correlation headers.
- Build passes 14/14 workspaces and all 15 artifact groups; app-factory and source-secret checks pass.
- API and worker isolated production layouts import successfully, contain the database migrator, and resolve injected `@staybuddy/*` packages inside their release directories rather than the source workspace.
- This Mac has no Docker CLI/daemon, so container image execution is not claimed locally; the hosted Build Artifacts job remains the container-build proof.

## Hosted CI evidence

Pull request [#2](https://github.com/KannapatINFX/staybuddy-platform/pull/2) at implementation head commit `9ef4b4008b3eeb932b6117d17702de39037441ec` passed all protected checks in [run 33385841523](https://github.com/KannapatINFX/staybuddy-platform/actions/runs/33385841523) on 31 August 2026:

- `Required / Quality`: PASS in 1m25s, including Terraform validation and all 32 foundation controls.
- `Required / Migrations & Integration`: PASS in 1m05s against clean PostgreSQL/Redis services, including database 4/4 and API 4/4.
- `Required / Build Artifacts`: PASS in 3m34s, including both production Docker image builds.
- `Required / Secret Scan`: PASS in 35s.
- Artifact `staybuddy-build-2462e0e7cef127b715a618525254ec1e8f9eb2e8` (ID `9755621848`, 78,478,625 bytes) is retained through 7 September 2026.

GitHub reports the PR `BLOCKED` with `REVIEW_REQUIRED`, proving the protected one-approval rule remains enforced. A closure audit on 1 September 2026 found only the repository administrator `KannapatINFX` in the collaborator list, so no independent reviewer is currently available.

## Exit-gate decision

The code, local evidence, hosted CI, and container builds satisfy every repository-controlled portion of Sprint 4. The source exit gate specifically requires API and worker to deploy to dev from CI with traceable health checks. No AWS account configuration, OIDC deploy role, remote-state bucket, ACM certificate/DNS, customer KMS/application secret, Sentry DSN, dev health URL, or independent reviewer is configured in the repository at review time. The closure audit also confirmed that this workstation has no AWS CLI/profile or AWS/Terraform/Sentry credentials, both available browser sessions reach provider sign-in pages, the GitHub repository has no Actions variables or secrets, and it has no configured environments.

Therefore Sprint 4 is **CONDITIONAL**, not complete. It becomes complete only when:

1. pull request #2 receives the required independent approval (all four protected hosted checks already pass);
2. the accepted commit is deployed by `Deploy Dev` to an authorized AWS dev environment; and
3. retained workflow evidence proves stable API/worker services, PostgreSQL-backed health, a valid response trace ID, and the matching X-Ray trace.

No branch-protection requirement may be weakened to close this gate. Sprint 5 remains not started.
