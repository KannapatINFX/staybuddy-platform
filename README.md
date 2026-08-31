# StayBuddy Platform

Target platform for the 28 August 2026 StayBuddy source-of-truth set. This is a new modular TypeScript monorepo; `../STBcodeMar` is migration evidence only.

## Workspace

- `apps/mobile`: Expo hotel-branded guest application.
- `apps/hotel-admin`: hotel operations portal.
- `apps/ops-admin`: StayBuddy platform operations portal.
- `apps/merchant-portal`: Phase 2 shell only.
- `services/api`: NestJS/Fastify modular API.
- `services/worker`: BullMQ workers/scheduler.
- `packages/*`: domain, contracts, database, localization, UI, app/PMS and observability libraries.

## Local start

1. Copy `.env.example` to a local secret file outside source control.
2. Start PostgreSQL and Redis using `compose.yaml` or equivalent local services.
3. Run `pnpm install`, `pnpm db:migrate`, then `pnpm dev`.

Run `pnpm ci:quality` before review. Run `pnpm ci:verify` with a disposable PostgreSQL database before merging; it is the local parity command for the four required GitHub checks.

Project rules live in `../agent.md`. Current sprint evidence and runbooks live under `docs/`.

## Sprint status

Sprints 1 and 2 are accepted complete; see `../docs/migration/SPRINT_1_COMPLETION_REPORT.md` and
`../docs/product/SPRINT_2_COMPLETION_REPORT.md`. Sprint 3 is active with local and hosted CI verified, but it remains CONDITIONAL until protected `main` is available and verified; see `docs/SPRINT_3_ACCEPTANCE_REPORT.md`. Implementation already present for Sprint 4-10 is provisional and must be reviewed in sequence. The historical command evidence remains in `docs/SPRINT_1_10_RELEASE_EVIDENCE.md`, but it is not the authoritative completion record.
