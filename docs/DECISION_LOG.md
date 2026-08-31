# Decision Log

This is the target-monorepo index of active architecture decisions. Canonical ADR content remains in [`../../docs/adr/`](../../docs/adr/).

| Date        | Decision                                                                                         | ADR                                                                                   | Status   |
| ----------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | -------- |
| 30 Aug 2026 | Build a new target monorepo and selectively migrate legacy evidence                              | [ADR-0001](../../docs/adr/ADR-0001-replatform-new-monorepo.md)                        | Accepted |
| 31 Aug 2026 | Lock canonical guest navigation and screen identity                                              | [ADR-0002](../../docs/adr/ADR-0002-canonical-navigation-and-screen-identity.md)       | Accepted |
| 31 Aug 2026 | Give each mutable aggregate one bounded-context owner and use versioned events across boundaries | [ADR-0003](../../docs/adr/ADR-0003-bounded-context-ownership.md)                      | Accepted |
| 31 Aug 2026 | Standardize the monorepo engineering system and four required CI checks                          | [ADR-0004](../../docs/adr/ADR-0004-target-monorepo-engineering-system.md)             | Accepted |
| 31 Aug 2026 | Establish the AWS environment, immutable deployment, migration, and observability baseline       | [ADR-0005](../../docs/adr/ADR-0005-aws-environment-observability-deployment.md)       | Accepted |
| 1 Sep 2026  | Keep frontend-only web delivery on Hostinger and the trusted backend/data plane on AWS           | [ADR-0006](../../docs/adr/ADR-0006-hostinger-frontend-aws-backend-boundary.md)        | Accepted |
| 1 Sep 2026  | Separate runtime/migration identities and enforce scoped tenant/platform reliable mutations      | [ADR-0007](../../docs/adr/ADR-0007-tenant-security-runtime-and-reliable-mutations.md) | Accepted |

Sprint progress is not an ADR. See [`CURRENT_SPRINT.md`](CURRENT_SPRINT.md) and the sprint acceptance report for gate status.
