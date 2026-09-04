import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendAuditAndOutbox,
  claimOutboxEvents,
  createDatabasePool,
  executeIdempotent,
  markOutboxProcessed,
  recordOutboxFailure,
  runMigrations,
  withPlatformTransaction,
  withTenantTransaction,
} from "../src/index.js";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const pool = databaseUrl ? createDatabasePool(databaseUrl) : undefined;
const hotelA = randomUUID();
const hotelB = randomUUID();

describeWithDatabase("PostgreSQL tenant boundary", () => {
  beforeAll(async () => {
    await runMigrations(pool!);
    await pool!.query(`DO $$ BEGIN EXECUTE format('GRANT staybuddy_app TO %I', current_user); END $$`);
    for (const [id, slug] of [
      [hotelA, `hotel-a-${hotelA.slice(0, 8)}`],
      [hotelB, `hotel-b-${hotelB.slice(0, 8)}`],
    ]) {
      await pool!.query(
        `INSERT INTO hotels (id, slug, legal_name, display_name, status, timezone, country_code, room_count)
         VALUES ($1,$2,$2,$2,'ONBOARDING','Asia/Bangkok','TH',80)`,
        [id, slug],
      );
    }
  });

  afterAll(async () => pool?.end());

  it("serializes concurrent forward migration runners", async () => {
    const results = await Promise.all([runMigrations(pool!), runMigrations(pool!)]);
    expect(results).toEqual([[], []]);
  });

  it("keeps the login role non-owner and requires an explicit scoped database role", async () => {
    const privileges = await pool!.query<{
      direct_select: boolean;
      tenant_member: boolean;
      platform_member: boolean;
    }>(
      `SELECT
         has_table_privilege('staybuddy_runtime','hotels','SELECT') AS direct_select,
         pg_has_role('staybuddy_runtime','staybuddy_app','MEMBER') AS tenant_member,
         pg_has_role('staybuddy_runtime','staybuddy_platform','MEMBER') AS platform_member`,
    );
    expect(privileges.rows[0]).toEqual({
      direct_select: false,
      tenant_member: true,
      platform_member: true,
    });
  });

  it("prevents Hotel A from reading Hotel B", async () => {
    await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "test", traceId: randomUUID() },
      async (client) => {
        await client.query(
          `INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes)
           VALUES ($1, 'FRONT', 'Front Desk', 10)`,
          [hotelA],
        );
      },
    );
    const visible = await withTenantTransaction(
      pool!,
      { hotelId: hotelB, actorId: "test", traceId: randomUUID() },
      (client) => client.query("SELECT hotel_id FROM hotel_departments"),
    );
    expect(visible.rows).toHaveLength(0);
  });

  it("prevents Hotel A from writing a Hotel B row", async () => {
    await expect(
      withTenantTransaction(pool!, { hotelId: hotelA, actorId: "test", traceId: randomUUID() }, (client) =>
        client.query(
          `INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes)
             VALUES ($1, 'SPA', 'Spa', 15)`,
          [hotelB],
        ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("replays an idempotent result without running the action twice", async () => {
    const key = `test-${randomUUID()}`;
    let executions = 0;
    const run = () =>
      withTenantTransaction(pool!, { hotelId: hotelA, actorId: "test", traceId: randomUUID() }, (client) =>
        executeIdempotent(client, {
          hotelId: hotelA,
          key,
          request: { value: 1 },
          expiresAt: new Date(Date.now() + 60_000),
          action: async () => {
            executions += 1;
            return { status: 201, body: { id: "same" } };
          },
        }),
      );
    expect((await run()).replayed).toBe(false);
    expect((await run()).replayed).toBe(true);
    expect(executions).toBe(1);
  });

  it("rejects an idempotency key reused with a different request", async () => {
    const key = `mismatch-${randomUUID()}`;
    const execute = (request: unknown) =>
      withTenantTransaction(pool!, { hotelId: hotelA, actorId: "test", traceId: randomUUID() }, (client) =>
        executeIdempotent(client, {
          hotelId: hotelA,
          key,
          request,
          expiresAt: new Date(Date.now() + 60_000),
          action: async () => ({ status: 201, body: { ok: true } }),
        }),
      );
    await execute({ value: 1 });
    await expect(execute({ value: 2 })).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("enforces tenant policies on every tenant-owned table", async () => {
    const expected = [
      "hotels",
      "hotel_locations",
      "hotel_apps",
      "hotel_brand_profiles",
      "hotel_features",
      "hotel_departments",
      "hotel_memberships",
      "hotel_commercial_configs",
      "hotel_onboarding_profiles",
      "hotel_onboarding_steps",
      "hotel_service_categories",
      "hotel_public_config_versions",
      "app_build_jobs",
      "app_build_status_events",
      "idempotency_keys",
      "outbox_events",
      "audit_logs",
      "reservation_mapping_profiles",
      "reservation_import_previews",
      "reservation_import_batches",
      "reservations",
      "reservation_rooms",
      "stays",
      "reservation_import_rejections",
      "hotel_guest_accounts",
      "guest_auth_identities",
      "guest_devices",
      "guest_sessions",
      "push_subscriptions",
      "stay_claims",
      "stay_claim_sessions",
      "prearrival_invitations",
      "prearrival_invitation_sessions",
      "stay_guest_memberships",
      "consent_definitions",
      "consent_events",
      "consent_current",
      "email_otp_challenges",
    ];
    const policies = await pool!.query<{ tablename: string; roles: string[] }>(
      `SELECT tablename, roles FROM pg_policies
       WHERE schemaname='public' AND policyname='tenant_isolation' ORDER BY tablename`,
    );
    expect(policies.rows.map((row) => row.tablename)).toEqual([...expected].sort());
    expect(policies.rows.every((row) => row.roles.includes("staybuddy_app"))).toBe(true);
  });

  it("rejects cross-tenant foreign-key references even when the new row uses Hotel A", async () => {
    const suffix = randomUUID().replaceAll("-", "");
    const appB = await pool!.query<{ id: string }>(
      `INSERT INTO hotel_apps
        (hotel_id, app_installation_key_hash, app_installation_key_hint, app_name, scheme, ios_bundle_id, android_package, status)
       VALUES ($1,$2,'hint','Hotel B','hotelb',$3,$4,'DRAFT') RETURNING id`,
      [hotelB, randomUUID(), `com.test.b${suffix}.ios`, `com.test.b${suffix}.android`],
    );
    await expect(
      withPlatformTransaction(
        pool!,
        { actorId: "test", platformRole: "STAYBUDDY_SUPER_ADMIN", traceId: randomUUID() },
        (client) =>
          client.query(
            `INSERT INTO app_build_jobs
              (hotel_id, hotel_app_id, platform, profile, status, version, requested_by)
             VALUES ($1,$2,'IOS','PREVIEW','QUEUED','1.0.0','test')`,
            [hotelA, appB.rows[0]!.id],
          ),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("keeps audit facts append-only and outbox facts immutable", async () => {
    const ids = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "test", traceId: randomUUID() },
      async (client) => {
        const traceId = randomUUID();
        await appendAuditAndOutbox(client, {
          hotelId: hotelA,
          actor: { type: "SYSTEM", id: "test" },
          action: "foundation.tested",
          resource: { type: "hotel", id: hotelA },
          event: {
            type: "foundation.tested",
            aggregateType: "hotel",
            aggregateId: hotelA,
            payload: { immutable: true },
          },
          traceId,
          correlationId: traceId,
        });
        const audit = await client.query<{ id: string }>(
          "SELECT id FROM audit_logs WHERE action='foundation.tested' ORDER BY occurred_at DESC LIMIT 1",
        );
        const event = await client.query<{ id: string }>(
          "SELECT id FROM outbox_events WHERE event_type='foundation.tested' ORDER BY occurred_at DESC LIMIT 1",
        );
        return { auditId: audit.rows[0]!.id, eventId: event.rows[0]!.id };
      },
    );
    await expect(
      withTenantTransaction(pool!, { hotelId: hotelA, actorId: "test", traceId: randomUUID() }, (client) =>
        client.query("UPDATE audit_logs SET action='changed' WHERE id=$1", [ids.auditId]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withTenantTransaction(pool!, { hotelId: hotelA, actorId: "test", traceId: randomUUID() }, (client) =>
        client.query("UPDATE outbox_events SET payload='{}' WHERE id=$1", [ids.eventId]),
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("claims outbox work once and exposes retry/dead-letter state", async () => {
    const eventId = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "test", traceId: randomUUID() },
      async (client) => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO outbox_events
            (hotel_id,event_type,schema_version,aggregate_type,aggregate_id,payload,producer,actor,trace_id,correlation_id)
           VALUES ($1::uuid,'outbox.retry',1,'hotel',$1::text,'{}','db-test','{"type":"SYSTEM"}',$2,$2)
           RETURNING id`,
          [hotelA, randomUUID()],
        );
        return inserted.rows[0]!.id;
      },
    );
    const first = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) => claimOutboxEvents(client, "worker-a", 100),
    );
    expect(first.some((event) => event.id === eventId)).toBe(true);
    const duplicateClaim = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) => claimOutboxEvents(client, "worker-b", 100),
    );
    expect(duplicateClaim.some((event) => event.id === eventId)).toBe(false);
    const firstFailure = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) =>
        recordOutboxFailure(client, {
          eventId,
          workerId: "worker-a",
          errorCode: "TEMPORARY",
          maxAttempts: 2,
        }),
    );
    expect(firstFailure.deadLettered).toBe(false);
    await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) => client.query("UPDATE outbox_events SET available_at=now() WHERE id=$1", [eventId]),
    );
    const second = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) => claimOutboxEvents(client, "worker-b", 100),
    );
    expect(second.some((event) => event.id === eventId)).toBe(true);
    const secondFailure = await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "worker", traceId: randomUUID() },
      (client) =>
        recordOutboxFailure(client, {
          eventId,
          workerId: "worker-b",
          errorCode: "PERMANENT",
          maxAttempts: 2,
        }),
    );
    expect(secondFailure.deadLettered).toBe(true);
  });

  it("marks a claimed outbox event processed only for its owner", async () => {
    const event = await withTenantTransaction(
      pool!,
      { hotelId: hotelB, actorId: "worker", traceId: randomUUID() },
      async (client) => {
        await client.query(
          `INSERT INTO outbox_events
            (hotel_id,event_type,schema_version,aggregate_type,aggregate_id,payload,producer,actor,trace_id,correlation_id)
           VALUES ($1::uuid,'outbox.success',1,'hotel',$1::text,'{}','db-test','{"type":"SYSTEM"}',$2,$2)`,
          [hotelB, randomUUID()],
        );
        return (await claimOutboxEvents(client, "worker-success", 100)).find(
          (item) => item.eventType === "outbox.success",
        )!;
      },
    );
    await expect(
      withTenantTransaction(pool!, { hotelId: hotelB, actorId: "worker", traceId: randomUUID() }, (client) =>
        markOutboxProcessed(client, event.id, "wrong-worker"),
      ),
    ).rejects.toThrow("OUTBOX_CLAIM_LOST");
    await withTenantTransaction(
      pool!,
      { hotelId: hotelB, actorId: "worker", traceId: randomUUID() },
      (client) => markOutboxProcessed(client, event.id, "worker-success"),
    );
  });

  it("prevents support and tenant-resolver contexts from escalating database access", async () => {
    await expect(
      withPlatformTransaction(
        pool!,
        { actorId: "support", platformRole: "STAYBUDDY_SUPPORT", traceId: randomUUID() },
        (client) =>
          client.query(
            `INSERT INTO hotels (slug,legal_name,display_name,status,timezone,country_code,room_count)
             VALUES ($1,'Denied','Denied','DRAFT','Asia/Bangkok','TH',1)`,
            [`denied-${randomUUID().slice(0, 8)}`],
          ),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const auditRows = await withPlatformTransaction(
      pool!,
      { actorId: "resolver", platformRole: "STAYBUDDY_TENANT_RESOLVER", traceId: randomUUID() },
      (client) => client.query("SELECT id FROM audit_logs"),
    );
    expect(auditRows.rows).toHaveLength(0);
  });
});
