import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let controls = 0;

async function expect(relativePath, pattern, description) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  controls += 1;
  if (!pattern.test(contents)) failures.push(`${relativePath}: ${description}`);
}

async function expectCount(relativePath, pattern, expected, description) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  controls += 1;
  const count = contents.match(pattern)?.length ?? 0;
  if (count !== expected)
    failures.push(`${relativePath}: ${description}; found ${count}, expected ${expected}`);
}

const migration = "packages/db/migrations/0004_tenant_security_foundation.sql";
const database = "packages/db/src/index.ts";

const checks = [
  [
    migration,
    /CREATE ROLE staybuddy_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT/,
    "runtime database role must start locked down",
  ],
  [
    migration,
    /GRANT staybuddy_app, staybuddy_platform TO staybuddy_runtime/,
    "runtime login must assume only an explicit scoped role",
  ],
  [migration, /CREATE TABLE IF NOT EXISTS platform_identities/, "platform identities are required"],
  [migration, /CREATE TABLE IF NOT EXISTS platform_role_grants/, "platform role grants are required"],
  [
    migration,
    /CREATE POLICY tenant_isolation[\s\S]*TO staybuddy_app/,
    "tenant RLS must target the tenant role explicitly",
  ],
  [
    migration,
    /platform_system_outbox[\s\S]*hotel_id IS NULL/,
    "platform system access must not bypass tenant outbox RLS",
  ],
  [
    migration,
    /hotel_memberships_tenant_department_fkey/,
    "department membership must use a tenant-safe composite key",
  ],
  [migration, /app_build_jobs_tenant_app_fkey/, "app build linkage must use a tenant-safe composite key"],
  [
    migration,
    /idempotency_keys_platform_key[\s\S]*WHERE hotel_id IS NULL/,
    "platform idempotency scope is required",
  ],
  [migration, /outbox_events_fact_immutable/, "outbox event facts must be immutable"],
  [database, /SET LOCAL ROLE staybuddy_app/, "tenant transactions must assume the tenant role"],
  [database, /SET LOCAL ROLE staybuddy_platform/, "platform transactions must assume the platform role"],
  [database, /executePlatformIdempotent/, "platform mutations must support idempotency"],
  [database, /locked_at < now\(\) - interval '5 minutes'/, "abandoned outbox claims must be recoverable"],
  [database, /recordOutboxFailure[\s\S]*dead_lettered_at/, "outbox failures must expose a dead-letter state"],
  [
    "services/api/src/principal.service.ts",
    /staff_identity_is_active/,
    "staff authentication must validate active server-side identity",
  ],
  [
    "services/api/src/principal.service.ts",
    /NODE_ENV\s*===\s*"test"\s*&&\s*process\.env\.ALLOW_DEBUG_AUTH\s*===\s*"true"/,
    "debug authentication must be test-only",
  ],
  [
    "packages/domain/src/index.ts",
    /canPlatform[\s\S]*canHotel/,
    "shared RBAC enforcement helpers are required",
  ],
  [
    "services/api/src/platform.controller.ts",
    /@Headers\("idempotency-key"\)/,
    "platform mutations must require idempotency keys",
  ],
  [
    "services/worker/src/outbox-relay.ts",
    /STAYBUDDY_TENANT_RESOLVER[\s\S]*withTenantTransaction/,
    "outbox relay must enumerate then process tenants in scope",
  ],
  ["services/worker/src/main.ts", /jobId: event\.id/, "outbox publication must be deduplicated by event ID"],
  [
    "packages/db/test/postgres.integration.test.ts",
    /prevents Hotel A from reading Hotel B/,
    "cross-hotel read isolation test is required",
  ],
  [
    "packages/db/test/postgres.integration.test.ts",
    /prevents Hotel A from writing a Hotel B row/,
    "cross-hotel write isolation test is required",
  ],
  [
    "services/api/test/api.integration.test.ts",
    /rejects role elevation|role elevation/,
    "API role-elevation test is required",
  ],
  [
    "infra/terraform/main.tf",
    /username\s*=\s*"staybuddy_migrator"/,
    "RDS master identity must be separate from staybuddy_app",
  ],
];

for (const check of checks) await expect(...check);
await expectCount(
  "infra/terraform/main.tf",
  /\{ name = "PGUSER", value = "staybuddy_runtime" \}/g,
  2,
  "API and worker must use the restricted runtime login",
);
await expectCount(
  "infra/terraform/main.tf",
  /\{ name = "PGPASSWORD", valueFrom = "\$\{var\.application_secret_arn\}:DATABASE_RUNTIME_PASSWORD::" \}/g,
  2,
  "API and worker must receive only the runtime password",
);

if (failures.length) {
  process.stderr.write(`Sprint 5 tenant-foundation check failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Sprint 5 tenant-foundation check passed for ${controls} controls.\n`);
}
