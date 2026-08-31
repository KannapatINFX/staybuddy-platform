# Tenant Security and Reliable Mutation Runbook

## Runtime identity contract

| Identity             | Login                    | Purpose                                          | Direct application-table access                              |
| -------------------- | ------------------------ | ------------------------------------------------ | ------------------------------------------------------------ |
| `staybuddy_migrator` | RDS-managed              | Forward migrations and runtime-password rotation | Owner/migration authority; never supplied to API or worker   |
| `staybuddy_runtime`  | Secrets Manager password | API and worker connection identity               | None; must assume a scoped role in a transaction             |
| `staybuddy_app`      | No                       | One-hotel tenant operations under RLS            | Tenant tables only after `SET LOCAL ROLE` and `app.hotel_id` |
| `staybuddy_platform` | No                       | Narrow platform/auth/resolver/system operations  | Only rows allowed by platform role policy                    |

The migration task is the only application image invocation that receives the RDS master secret. API and worker use `PGUSER=staybuddy_runtime` and `DATABASE_RUNTIME_PASSWORD` as `PGPASSWORD`. Never make either scoped role a login or table owner.

## First deployment and password rotation

1. Generate at least 32 random bytes for `DATABASE_RUNTIME_PASSWORD` and store it only in the customer-KMS-encrypted application secret.
2. Run the migration task with the RDS-managed `staybuddy_migrator` credentials and `DATABASE_RUNTIME_PASSWORD`. The migrator applies forward migrations, then configures the restricted runtime login.
3. Start API and worker with `staybuddy_runtime`; verify `/v1/health` and worker logs.
4. Confirm the runtime role has no direct privilege and can assume only the two scoped roles:

```sql
SELECT
  has_table_privilege('staybuddy_runtime', 'hotels', 'SELECT') AS direct_select,
  pg_has_role('staybuddy_runtime', 'staybuddy_app', 'MEMBER') AS tenant_member,
  pg_has_role('staybuddy_runtime', 'staybuddy_platform', 'MEMBER') AS platform_member;
```

Expected: `false, true, true`. Rotate by updating the application secret, rerunning the migration task to apply the password, and then rolling API and worker. Retain the previous secret version until the rollout is healthy; never print either password.

## Principal and tenant incident checks

For an authorization or suspected leakage incident:

1. Record environment, trace ID, correlation ID, actor ID, claimed hotel, route, and release SHA.
2. Confirm the actor has an active `staff_identities` row and active `hotel_memberships` row for the affected hotel. Token claims are evidence, not authority.
3. Confirm the repository used `withTenantTransaction` or `withPlatformTransaction`; a direct business-service pool query is a release blocker.
4. Run the Hotel A/Hotel B integration suite against an isolated restored or synthetic database. Never test using production guest records.
5. Suspend the identity or membership when containment is required. Do not disable RLS or grant the runtime role direct access.
6. Preserve audit and outbox rows. Use trace/correlation IDs to join request, mutation, event, and worker evidence.

Support view-as-hotel is not enabled by this foundation. Do not simulate it by changing session settings manually; it requires an audited product workflow in a later sprint.

## Outbox monitoring

The worker polls platform events separately, enumerates hotels through the tenant resolver policy, and claims tenant events inside one hotel scope. Publication uses the outbox UUID as the BullMQ job ID, so a retry after an uncertain publish does not create a second queue job.

Alert on:

- any `dead_lettered_at IS NOT NULL` row;
- oldest pending `available_at` exceeding the operational threshold;
- a claim remaining locked for more than five minutes;
- repeated `last_error_code` values or BullMQ jobs exhausting their attempts.

Tenant-scoped inspection template:

```sql
BEGIN;
SET LOCAL ROLE staybuddy_app;
SELECT set_config('app.hotel_id', '<hotel-uuid>', true);
SELECT id, event_type, aggregate_type, aggregate_id, attempt_count, last_error_code,
       available_at, locked_at, dead_lettered_at
FROM outbox_events
WHERE processed_at IS NULL
ORDER BY occurred_at;
ROLLBACK;
```

## Dead-letter recovery

1. Identify and fix the deterministic cause before replay. Confirm the consumer is idempotent for the event UUID/command ID.
2. Record incident, actor, hotel, event ID, reason, previous error, and release SHA.
3. In one tenant-scoped transaction, append an audit record and reset only delivery fields: `attempt_count`, `available_at`, `locked_at`, `locked_by`, `dead_lettered_at`, and `last_error_code`. Event facts, actor, payload, and correlation fields are immutable.
4. Observe the relay publish, BullMQ processing, and final `processed_at`. Close only after downstream state is reconciled.

Do not delete an outbox row, edit its payload, or mark it processed to clear an alert. For poison events that must not be replayed, retain the dead-letter row and document the compensating domain action.

## Required verification

Before merge or deployment run:

```bash
pnpm tenant-foundation:check
CI=true DATABASE_URL=postgresql://localhost:<port>/<fresh-database> pnpm ci:verify
```

The database must be freshly initialized. Required evidence includes 27 structural controls, all tenant-role policy checks, Hotel A/Hotel B read/write rejection, role-elevation and suspended-membership rejection, tenant/platform idempotency, append-only audit, immutable outbox facts, retry/dead-letter behavior, builds, artifacts, and secret scanning.
