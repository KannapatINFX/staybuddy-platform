import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  BootstrapManifestSchema,
  signBootstrapManifest,
  type BootstrapManifest,
  type HotelConfiguration,
} from "@staybuddy/contracts";
import {
  appendAuditAndOutbox,
  executePlatformIdempotent,
  type DatabaseClient,
  type DatabasePool,
  withPlatformTransaction,
} from "@staybuddy/db";
import { z } from "zod";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";
import type { PlatformPrincipal } from "./principal.service.js";

const CreateHotelInputSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    legalName: z.string().min(1).max(200),
    displayName: z.string().min(1).max(120),
    roomCount: z.coerce.number().int().positive(),
    timezone: z.string().min(3).max(80),
    countryCode: z.string().length(2).default("TH"),
  })
  .strict();

const CreateBuildJobInputSchema = z
  .object({
    hotelId: z.string().uuid(),
    hotelAppId: z.string().uuid(),
    platform: z.enum(["IOS", "ANDROID"]),
    profile: z.enum(["DEVELOPMENT", "PREVIEW", "PRODUCTION"]),
    version: z.string().min(1).max(80),
  })
  .strict();

@Injectable()
export class PlatformService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async createHotel(input: unknown, principal: PlatformPrincipal, idempotencyKey?: string) {
    if (!idempotencyKey) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    const values = CreateHotelInputSchema.parse(input);
    const traceId = randomUUID();
    try {
      const result = await withPlatformTransaction(
        this.pool,
        {
          actorId: principal.actorId,
          platformRole: principal.role,
          traceId,
          correlationId: idempotencyKey,
        },
        (client) =>
          executePlatformIdempotent(client, {
            scope: "hotel.create",
            key: idempotencyKey,
            request: values,
            expiresAt: new Date(Date.now() + 86_400_000),
            action: async () => ({
              status: 201,
              body: await this.persistHotel(client, values, principal, idempotencyKey, traceId),
            }),
          }),
      );
      return result;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", 409);
      if ((error as Error).message === "IDEMPOTENCY_KEY_REUSED") {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 409);
      }
      if ((error as Error).message === "IDEMPOTENCY_IN_PROGRESS") {
        throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409, true);
      }
      throw error;
    }
  }

  async listHotels(principal: PlatformPrincipal) {
    return withPlatformTransaction(
      this.pool,
      { actorId: principal.actorId, platformRole: principal.role, traceId: randomUUID() },
      async (client) => {
        const result = await client.query<{
          id: string;
          slug: string;
          display_name: string;
          status: string;
          room_count: number;
          app_status: string | null;
          app_updated_at: Date | null;
        }>(
          `SELECT h.id, h.slug, h.display_name, h.status, h.room_count,
                  a.status AS app_status, max(a.updated_at) AS app_updated_at
           FROM hotels h LEFT JOIN hotel_apps a ON a.hotel_id = h.id
           GROUP BY h.id, a.status ORDER BY h.created_at DESC`,
        );
        return result.rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          displayName: row.display_name,
          status: row.status,
          roomCount: row.room_count,
          appStatus: row.app_status,
          appUpdatedAt: row.app_updated_at?.toISOString() ?? null,
        }));
      },
    );
  }

  async createBuildJob(input: unknown, principal: PlatformPrincipal, idempotencyKey?: string) {
    if (!idempotencyKey) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    const values = CreateBuildJobInputSchema.parse(input);
    const traceId = randomUUID();
    try {
      return await withPlatformTransaction(
        this.pool,
        {
          actorId: principal.actorId,
          platformRole: principal.role,
          traceId,
          correlationId: idempotencyKey,
        },
        (client) =>
          executePlatformIdempotent(client, {
            scope: `app-build.create:${values.hotelId}`,
            key: idempotencyKey,
            request: values,
            expiresAt: new Date(Date.now() + 86_400_000),
            action: async () => {
              const result = await client.query<{ id: string }>(
                `INSERT INTO app_build_jobs
                  (hotel_id, hotel_app_id, platform, profile, status, version, requested_by)
                 VALUES ($1,$2,$3,$4,'QUEUED',$5,$6) RETURNING id`,
                [
                  values.hotelId,
                  values.hotelAppId,
                  values.platform,
                  values.profile,
                  values.version,
                  principal.actorId,
                ],
              );
              const buildJobId = result.rows[0]!.id;
              await appendAuditAndOutbox(client, {
                hotelId: values.hotelId,
                actor: { type: "STAYBUDDY_STAFF", id: principal.actorId, role: principal.role },
                action: "app.build.requested",
                resource: { type: "app_build_job", id: buildJobId },
                event: {
                  type: "app.build.requested",
                  aggregateType: "app_build_job",
                  aggregateId: buildJobId,
                  payload: {
                    hotelAppId: values.hotelAppId,
                    platform: values.platform,
                    profile: values.profile,
                    version: values.version,
                  },
                },
                traceId,
                correlationId: idempotencyKey,
                idempotencyKey,
                commandId: idempotencyKey,
              });
              return { status: 201, body: { buildJobId, status: "QUEUED" as const } };
            },
          }),
      );
    } catch (error) {
      if ((error as Error).message === "IDEMPOTENCY_KEY_REUSED") {
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 409);
      }
      if ((error as Error).message === "IDEMPOTENCY_IN_PROGRESS") {
        throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409, true);
      }
      throw error;
    }
  }

  async getBootstrap(appInstallationKey: string): Promise<ReturnType<typeof signBootstrapManifest>> {
    const keyHash = createHash("sha256").update(appInstallationKey).digest("hex");
    const result = await withPlatformTransaction(
      this.pool,
      {
        actorId: "mobile-bootstrap",
        platformRole: "STAYBUDDY_TENANT_RESOLVER",
        traceId: randomUUID(),
      },
      (client) =>
        client.query<{
          hotel_id: string;
          app_id: string;
          app_name: string;
          display_name: string;
          minimum_version: string;
          voice_profile: HotelConfiguration["voiceProfile"];
          theme: HotelConfiguration["theme"];
          supported_locales: HotelConfiguration["supportedLocales"];
          default_locale: HotelConfiguration["defaultLocale"];
          features: Record<string, boolean>;
        }>(
          `SELECT h.id AS hotel_id, a.id AS app_id, a.app_name, h.display_name, a.minimum_version,
                  b.voice_profile, b.theme, b.supported_locales, b.default_locale,
                  COALESCE(jsonb_object_agg(f.feature_key, f.enabled) FILTER (WHERE f.feature_key IS NOT NULL), '{}'::jsonb) AS features
           FROM hotel_apps a
           JOIN hotels h ON h.id = a.hotel_id
           JOIN hotel_brand_profiles b ON b.hotel_id = h.id AND b.is_active
           LEFT JOIN hotel_features f ON f.hotel_id = h.id
           WHERE a.app_installation_key_hash = $1 AND a.status <> 'PAUSED'
           GROUP BY h.id, a.id, b.id`,
          [keyHash],
        ),
    );
    const row = result.rows[0];
    if (!row) throw new AppError("NOT_FOUND", 404);
    const now = new Date();
    const manifest: BootstrapManifest = BootstrapManifestSchema.parse({
      schemaVersion: 1,
      appInstallationKey,
      hotelId: row.hotel_id,
      appId: row.app_id,
      appName: row.app_name,
      hotelDisplayName: row.display_name,
      theme: row.theme,
      supportedLocales: row.supported_locales,
      defaultLocale: row.default_locale,
      voiceProfile: row.voice_profile,
      features: row.features,
      minimumVersion: row.minimum_version,
      maintenance: { active: false },
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.valueOf() + 3_600_000).toISOString(),
    });
    const privateKey = process.env.BOOTSTRAP_PRIVATE_KEY_HEX;
    if (!privateKey) throw new AppError("INTERNAL_ERROR", 500);
    return signBootstrapManifest(manifest, privateKey);
  }

  private async persistHotel(
    client: DatabaseClient,
    values: z.infer<typeof CreateHotelInputSchema>,
    principal: PlatformPrincipal,
    idempotencyKey: string,
    traceId: string,
  ) {
    const hotelId = randomUUID();
    const appId = randomUUID();
    const appInstallationKey = randomBytes(24).toString("base64url");
    const appKeyHash = createHash("sha256").update(appInstallationKey).digest("hex");
    const theme = {
      primary: "#102A43",
      accent: "#C9A45C",
      canvas: "#FCF9F3",
      surfaceWarm: "#EFE6D7",
      ink: "#152535",
      divider: "#EDF1F3",
      logoUrl: `https://assets.example.invalid/${values.slug}/logo.png`,
      heroImageUrl: `https://assets.example.invalid/${values.slug}/hero.jpg`,
    };
    await client.query(
      `INSERT INTO hotels (id, slug, legal_name, display_name, status, timezone, country_code, room_count)
       VALUES ($1,$2,$3,$4,'ONBOARDING',$5,$6,$7)`,
      [
        hotelId,
        values.slug,
        values.legalName,
        values.displayName,
        values.timezone,
        values.countryCode,
        values.roomCount,
      ],
    );
    await client.query(
      `INSERT INTO hotel_apps
        (id, hotel_id, app_installation_key_hash, app_installation_key_hint, app_name, ios_bundle_id, android_package, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'DRAFT')`,
      [
        appId,
        hotelId,
        appKeyHash,
        appInstallationKey.slice(-6),
        values.displayName,
        `com.staybuddy.${values.slug.replaceAll("-", "")}`,
        `com.staybuddy.${values.slug.replaceAll("-", "")}`,
      ],
    );
    await client.query(
      `INSERT INTO hotel_brand_profiles
        (hotel_id, version, is_active, voice_profile, theme, supported_locales, default_locale)
       VALUES ($1,1,true,'FIVE_STAR_RESORT',$2,ARRAY['en','th','zh-CN','ru'],'en')`,
      [hotelId, JSON.stringify(theme)],
    );
    await client.query(
      `INSERT INTO hotel_commercial_configs
        (hotel_id, version, discount_minor, commerce_commission_basis_points, ai_markup_basis_points, effective_at)
       VALUES ($1,1,0,500,1250,now())`,
      [hotelId],
    );
    for (const [code, name, sla] of [
      ["FRONT", "Front Desk", 10],
      ["HOUSEKEEPING", "Housekeeping", 15],
      ["ENGINEERING", "Engineering", 15],
      ["FNB", "Food & Beverage", 15],
      ["SPA", "Spa", 20],
    ]) {
      await client.query(
        "INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes) VALUES ($1,$2,$3,$4)",
        [hotelId, code, name, sla],
      );
    }
    for (const feature of ["guestShell", "reservationCsv", "stayClaim", "emailOtp"]) {
      await client.query("INSERT INTO hotel_features (hotel_id, feature_key, enabled) VALUES ($1,$2,true)", [
        hotelId,
        feature,
      ]);
    }
    for (const definition of [
      ["TERMS", "SERVICE", true],
      ["PRIVACY", "SERVICE", true],
      ["MARKETING", "EMAIL", false],
      ["MARKETING", "PUSH", false],
      ["PARTNER_OFFERS", "IN_APP", false],
    ] as const) {
      await client.query(
        `INSERT INTO consent_definitions
          (hotel_id, purpose, channel, version, required, effective_at)
         VALUES ($1,$2,$3,'2026-08',$4,now())`,
        [hotelId, definition[0], definition[1], definition[2]],
      );
    }
    await appendAuditAndOutbox(client, {
      hotelId,
      actor: { type: "STAYBUDDY_STAFF", id: principal.actorId, role: principal.role },
      action: "hotel.created",
      resource: { type: "hotel", id: hotelId },
      event: {
        type: "hotel.created",
        aggregateType: "hotel",
        aggregateId: hotelId,
        payload: { slug: values.slug, roomCount: values.roomCount },
      },
      traceId,
      correlationId: idempotencyKey,
      idempotencyKey,
      commandId: idempotencyKey,
    });
    return {
      hotelId,
      appId,
      appInstallationKey,
      status: "ONBOARDING",
      nextStep: "Complete brand assets, reservation mapping and app validation",
    };
  }
}
