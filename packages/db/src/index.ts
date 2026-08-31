import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
export type DatabasePool = pg.Pool;
export type DatabaseClient = pg.PoolClient;

export function createDatabasePool(connectionString = process.env.DATABASE_URL): DatabasePool {
  if (!connectionString && !process.env.PGHOST) {
    throw new Error("DATABASE_URL or PostgreSQL PG* connection variables are required");
  }
  return new Pool({ ...(connectionString ? { connectionString } : {}), max: 10, statement_timeout: 15_000 });
}

export async function runMigrations(pool: DatabasePool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migrations (
      name text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const migrationDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
  const names = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const name of names) {
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const existing = await pool.query<{ sha256: string }>(
      "SELECT sha256 FROM app_schema_migrations WHERE name = $1",
      [name],
    );
    if (existing.rowCount) {
      if (existing.rows[0]?.sha256 !== sha256) throw new Error(`MIGRATION_CHANGED:${name}`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO app_schema_migrations (name, sha256) VALUES ($1, $2)", [name, sha256]);
      await client.query("COMMIT");
      applied.push(name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return applied;
}

export async function withTenantTransaction<T>(
  pool: DatabasePool,
  context: { hotelId: string; actorId: string; traceId: string; databaseRole?: string },
  action: (client: DatabaseClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (context.databaseRole) {
      if (!/^[a-z_][a-z0-9_]*$/.test(context.databaseRole)) throw new Error("INVALID_DATABASE_ROLE");
      await client.query(`SET LOCAL ROLE ${context.databaseRole}`);
    }
    await client.query("SELECT set_config('app.hotel_id', $1, true)", [context.hotelId]);
    await client.query("SELECT set_config('app.actor_id', $1, true)", [context.actorId]);
    await client.query("SELECT set_config('app.trace_id', $1, true)", [context.traceId]);
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
     ON CONFLICT (hotel_id, key) DO NOTHING
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

export async function appendAuditAndOutbox(
  client: DatabaseClient,
  input: {
    hotelId: string;
    actor: { type: string; id?: string; role?: string };
    action: string;
    resource: { type: string; id: string };
    event: { type: string; aggregateType: string; aggregateId: string; payload: unknown };
    traceId: string;
    correlationId: string;
    idempotencyKey?: string;
    reason?: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
      (hotel_id, actor_type, actor_id, actor_role, action, resource_type, resource_id, reason, trace_id, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      input.hotelId,
      input.actor.type,
      input.actor.id,
      input.actor.role,
      input.action,
      input.resource.type,
      input.resource.id,
      input.reason,
      input.traceId,
      input.correlationId,
    ],
  );
  await client.query(
    `INSERT INTO outbox_events
      (hotel_id, event_type, schema_version, aggregate_type, aggregate_id, payload, trace_id, correlation_id, idempotency_key)
     VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8)`,
    [
      input.hotelId,
      input.event.type,
      input.event.aggregateType,
      input.event.aggregateId,
      JSON.stringify(input.event.payload),
      input.traceId,
      input.correlationId,
      input.idempotencyKey,
    ],
  );
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
