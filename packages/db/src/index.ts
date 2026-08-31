import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export type TenantDatabaseContext = {
  hotelId: string;
  actorId: string;
  traceId: string;
  correlationId?: string;
  departmentId?: string;
};

export type PlatformDatabaseContext = {
  actorId: string;
  platformRole:
    | "STAYBUDDY_SUPER_ADMIN"
    | "STAYBUDDY_SUPPORT"
    | "STAYBUDDY_CONTENT_OPS"
    | "STAYBUDDY_FINANCE"
    | "STAYBUDDY_AUTHENTICATOR"
    | "STAYBUDDY_TENANT_RESOLVER"
    | "STAYBUDDY_SYSTEM";
  traceId: string;
  correlationId?: string;
};

export function createDatabasePool(connectionString = process.env.DATABASE_URL): DatabasePool {
  if (!connectionString && !process.env.PGHOST) {
    throw new Error("DATABASE_URL or PostgreSQL PG* connection variables are required");
  }
  return new Pool({ ...(connectionString ? { connectionString } : {}), max: 10, statement_timeout: 15_000 });
}

export async function runMigrations(pool: DatabasePool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [1398034754, 1296388681]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        name text PRIMARY KEY,
        sha256 text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
    const names = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
    for (const name of names) {
      const sql = await readFile(path.join(migrationDirectory, name), "utf8");
      const sha256 = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query<{ sha256: string }>(
        "SELECT sha256 FROM app_schema_migrations WHERE name = $1",
        [name],
      );
      if (existing.rowCount) {
        if (existing.rows[0]?.sha256 !== sha256) throw new Error(`MIGRATION_CHANGED:${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO app_schema_migrations (name, sha256) VALUES ($1, $2)", [
          name,
          sha256,
        ]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return applied;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [1398034754, 1296388681]);
    client.release();
  }
}

export async function configureRuntimeDatabaseRole(pool: DatabasePool, password: string): Promise<void> {
  if (password.length < 32) throw new Error("DATABASE_RUNTIME_PASSWORD_TOO_SHORT");
  const client = await pool.connect();
  try {
    const statement = await client.query<{ sql: string }>(
      "SELECT format('ALTER ROLE staybuddy_runtime LOGIN PASSWORD %L', $1) AS sql",
      [password],
    );
    await client.query(statement.rows[0]!.sql);
  } finally {
    client.release();
  }
}

export async function withTenantTransaction<T>(
  pool: DatabasePool,
  context: TenantDatabaseContext,
  action: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE staybuddy_app");
    await client.query("SELECT set_config('app.hotel_id', $1, true)", [context.hotelId]);
    await client.query("SELECT set_config('app.actor_id', $1, true)", [context.actorId]);
    await client.query("SELECT set_config('app.trace_id', $1, true)", [context.traceId]);
    await client.query("SELECT set_config('app.correlation_id', $1, true)", [
      context.correlationId ?? context.traceId,
    ]);
    await client.query("SELECT set_config('app.department_id', $1, true)", [context.departmentId ?? ""]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function withPlatformTransaction<T>(
  pool: DatabasePool,
  context: PlatformDatabaseContext,
  action: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE staybuddy_platform");
    await client.query("SELECT set_config('app.actor_id', $1, true)", [context.actorId]);
    await client.query("SELECT set_config('app.platform_role', $1, true)", [context.platformRole]);
    await client.query("SELECT set_config('app.trace_id', $1, true)", [context.traceId]);
    await client.query("SELECT set_config('app.correlation_id', $1, true)", [
      context.correlationId ?? context.traceId,
    ]);
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function fingerprintRequest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function executeIdempotent<T>(
  client: DatabaseClient,
  input: {
    hotelId: string;
    key: string;
    request: unknown;
    expiresAt: Date;
    action: () => Promise<{ status: number; body: T }>;
  },
): Promise<{ status: number; body: T; replayed: boolean }> {
  const fingerprint = fingerprintRequest(input.request);
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (hotel_id, key, request_fingerprint, status, expires_at)
     VALUES ($1, $2, $3, 'PROCESSING', $4)
     ON CONFLICT (hotel_id, key) WHERE hotel_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [input.hotelId, input.key, fingerprint, input.expiresAt],
  );
  if (!inserted.rowCount) {
    const existing = await client.query<{
      request_fingerprint: string;
      status: string;
      response_status: number | null;
      response_body: T | null;
    }>(
      `SELECT request_fingerprint, status, response_status, response_body
       FROM idempotency_keys WHERE hotel_id = $1 AND key = $2 FOR UPDATE`,
      [input.hotelId, input.key],
    );
    const row = existing.rows[0];
    if (!row || row.request_fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (row.status !== "COMPLETED" || row.response_status === null || row.response_body === null) {
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    }
    return { status: row.response_status, body: row.response_body, replayed: true };
  }
  const response = await input.action();
  await client.query(
    `UPDATE idempotency_keys
     SET status = 'COMPLETED', response_status = $3, response_body = $4
     WHERE hotel_id = $1 AND key = $2`,
    [input.hotelId, input.key, response.status, JSON.stringify(response.body)],
  );
  return { ...response, replayed: false };
}

export async function executePlatformIdempotent<T>(
  client: DatabaseClient,
  input: {
    scope: string;
    key: string;
    request: unknown;
    expiresAt: Date;
    action: () => Promise<{ status: number; body: T }>;
  },
): Promise<{ status: number; body: T; replayed: boolean }> {
  const fingerprint = fingerprintRequest(input.request);
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (hotel_id, platform_scope, key, request_fingerprint, status, expires_at)
     VALUES (NULL, $1, $2, $3, 'PROCESSING', $4)
     ON CONFLICT (platform_scope, key) WHERE hotel_id IS NULL DO NOTHING
     RETURNING id`,
    [input.scope, input.key, fingerprint, input.expiresAt],
  );
  if (!inserted.rowCount) {
    const existing = await client.query<{
      request_fingerprint: string;
      status: string;
      response_status: number | null;
      response_body: T | null;
    }>(
      `SELECT request_fingerprint, status, response_status, response_body
       FROM idempotency_keys WHERE hotel_id IS NULL AND platform_scope = $1 AND key = $2 FOR UPDATE`,
      [input.scope, input.key],
    );
    const row = existing.rows[0];
    if (!row || row.request_fingerprint !== fingerprint) throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (row.status !== "COMPLETED" || row.response_status === null || row.response_body === null) {
      throw new Error("IDEMPOTENCY_IN_PROGRESS");
    }
    return { status: row.response_status, body: row.response_body, replayed: true };
  }
  const response = await input.action();
  await client.query(
    `UPDATE idempotency_keys
     SET status = 'COMPLETED', response_status = $3, response_body = $4
     WHERE hotel_id IS NULL AND platform_scope = $1 AND key = $2`,
    [input.scope, input.key, response.status, JSON.stringify(response.body)],
  );
  return { ...response, replayed: false };
}

export async function appendAuditAndOutbox(
  client: DatabaseClient,
  input: {
    hotelId: string;
    actor: { type: string; id?: string; role?: string };
    action: string;
    resource: { type: string; id: string };
    event: { type: string; aggregateType: string; aggregateId: string; payload: unknown };
    producer?: string;
    traceId: string;
    correlationId: string;
    idempotencyKey?: string;
    commandId?: string;
    causationId?: string;
    reason?: string;
    sensitiveFields?: string[];
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
      (hotel_id, actor_type, actor_id, actor_role, action, resource_type, resource_id, reason,
       sensitive_fields, trace_id, correlation_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.hotelId,
      input.actor.type,
      input.actor.id,
      input.actor.role,
      input.action,
      input.resource.type,
      input.resource.id,
      input.reason,
      input.sensitiveFields ?? [],
      input.traceId,
      input.correlationId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
  await client.query(
    `INSERT INTO outbox_events
      (hotel_id, event_type, schema_version, aggregate_type, aggregate_id, payload, producer, actor,
       trace_id, correlation_id, causation_id, idempotency_key, command_id)
     VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      input.hotelId,
      input.event.type,
      input.event.aggregateType,
      input.event.aggregateId,
      JSON.stringify(input.event.payload),
      input.producer ?? "staybuddy-api",
      JSON.stringify(input.actor),
      input.traceId,
      input.correlationId,
      input.causationId,
      input.idempotencyKey,
      input.commandId ?? input.idempotencyKey,
    ],
  );
}

export type ClaimedOutboxEvent = {
  id: string;
  hotelId: string | null;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  producer: string;
  actor: unknown;
  traceId: string;
  correlationId: string;
  causationId: string | null;
  commandId: string | null;
  attemptCount: number;
};

export async function claimOutboxEvents(
  client: DatabaseClient,
  workerId: string,
  limit = 50,
): Promise<ClaimedOutboxEvent[]> {
  if (!workerId || workerId.length > 120) throw new Error("INVALID_WORKER_ID");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("INVALID_OUTBOX_LIMIT");
  const result = await client.query<{
    id: string;
    hotel_id: string | null;
    event_type: string;
    schema_version: number;
    aggregate_type: string;
    aggregate_id: string;
    payload: unknown;
    producer: string;
    actor: unknown;
    trace_id: string;
    correlation_id: string;
    causation_id: string | null;
    command_id: string | null;
    attempt_count: number;
  }>(
    `WITH candidates AS (
       SELECT id FROM outbox_events
       WHERE processed_at IS NULL
         AND dead_lettered_at IS NULL
         AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
         AND available_at <= now()
       ORDER BY available_at, occurred_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     UPDATE outbox_events event
     SET locked_at = now(), locked_by = $2
     FROM candidates
     WHERE event.id = candidates.id
     RETURNING event.id, event.hotel_id, event.event_type, event.schema_version,
       event.aggregate_type, event.aggregate_id, event.payload, event.producer, event.actor,
       event.trace_id, event.correlation_id, event.causation_id, event.command_id, event.attempt_count`,
    [limit, workerId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    hotelId: row.hotel_id,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    payload: row.payload,
    producer: row.producer,
    actor: row.actor,
    traceId: row.trace_id,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    commandId: row.command_id,
    attemptCount: row.attempt_count,
  }));
}

export async function markOutboxProcessed(
  client: DatabaseClient,
  eventId: string,
  workerId: string,
): Promise<void> {
  const result = await client.query(
    `UPDATE outbox_events
     SET processed_at = now(), locked_at = NULL, locked_by = NULL
     WHERE id = $1 AND locked_by = $2 AND processed_at IS NULL AND dead_lettered_at IS NULL`,
    [eventId, workerId],
  );
  if (result.rowCount !== 1) throw new Error("OUTBOX_CLAIM_LOST");
}

export async function recordOutboxFailure(
  client: DatabaseClient,
  input: { eventId: string; workerId: string; errorCode: string; maxAttempts?: number },
): Promise<{ deadLettered: boolean }> {
  const maxAttempts = input.maxAttempts ?? 5;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new Error("INVALID_OUTBOX_MAX_ATTEMPTS");
  }
  const result = await client.query<{ dead_lettered_at: Date | null }>(
    `UPDATE outbox_events
     SET attempt_count = attempt_count + 1,
         last_error_code = $3,
         dead_lettered_at = CASE WHEN attempt_count + 1 >= $4 THEN now() ELSE NULL END,
         available_at = CASE
           WHEN attempt_count + 1 >= $4 THEN available_at
           ELSE now() + make_interval(secs => LEAST(3600, power(2, attempt_count + 1)::integer))
         END,
         locked_at = NULL,
         locked_by = NULL
     WHERE id = $1 AND locked_by = $2 AND processed_at IS NULL AND dead_lettered_at IS NULL
     RETURNING dead_lettered_at`,
    [input.eventId, input.workerId, input.errorCode, maxAttempts],
  );
  const row = result.rows[0];
  if (!row) throw new Error("OUTBOX_CLAIM_LOST");
  return { deadLettered: row.dead_lettered_at !== null };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
