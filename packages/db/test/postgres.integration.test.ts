import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, executeIdempotent, runMigrations, withTenantTransaction } from "../src/index.js";

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

  it("prevents Hotel A from reading Hotel B", async () => {
    await withTenantTransaction(
      pool!,
      { hotelId: hotelA, actorId: "test", traceId: randomUUID(), databaseRole: "staybuddy_app" },
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
      { hotelId: hotelB, actorId: "test", traceId: randomUUID(), databaseRole: "staybuddy_app" },
      (client) => client.query("SELECT hotel_id FROM hotel_departments"),
    );
    expect(visible.rows).toHaveLength(0);
  });

  it("prevents Hotel A from writing a Hotel B row", async () => {
    await expect(
      withTenantTransaction(
        pool!,
        { hotelId: hotelA, actorId: "test", traceId: randomUUID(), databaseRole: "staybuddy_app" },
        (client) =>
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
      withTenantTransaction(
        pool!,
        { hotelId: hotelA, actorId: "test", traceId: randomUUID(), databaseRole: "staybuddy_app" },
        (client) =>
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
});
