import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  BootstrapManifestSchema,
  signBootstrapManifest,
  type BootstrapManifest,
  type HotelConfiguration,
} from "@staybuddy/contracts";
import type { DatabasePool } from "@staybuddy/db";
import { z } from "zod";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";

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

@Injectable()
export class PlatformService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async createHotel(input: unknown, actorId: string) {
    const values = CreateHotelInputSchema.parse(input);
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
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
      const departments = [
        ["FRONT", "Front Desk", 10],
        ["HOUSEKEEPING", "Housekeeping", 15],
        ["ENGINEERING", "Engineering", 15],
        ["FNB", "Food & Beverage", 15],
        ["SPA", "Spa", 20],
      ];
      for (const [code, name, sla] of departments) {
        await client.query(
          `INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes) VALUES ($1,$2,$3,$4)`,
          [hotelId, code, name, sla],
        );
      }
      for (const feature of ["guestShell", "reservationCsv", "stayClaim", "emailOtp"]) {
        await client.query(
          "INSERT INTO hotel_features (hotel_id, feature_key, enabled) VALUES ($1,$2,true)",
          [hotelId, feature],
        );
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
      await client.query(
        `INSERT INTO audit_logs
          (hotel_id, actor_type, actor_id, actor_role, action, resource_type, resource_id, trace_id, correlation_id)
         VALUES ($1,'STAYBUDDY_STAFF',$2,'STAYBUDDY_SUPER_ADMIN','hotel.created','hotel',($1::uuid)::text,$3,$3)`,
        [hotelId, actorId, randomUUID()],
      );
      await client.query(
        `INSERT INTO outbox_events
          (hotel_id, event_type, schema_version, aggregate_type, aggregate_id, payload, trace_id, correlation_id)
         VALUES ($1,'hotel.created',1,'hotel',($1::uuid)::text,$2,$3,$3)`,
        [hotelId, JSON.stringify({ slug: values.slug, roomCount: values.roomCount }), randomUUID()],
      );
      await client.query("COMMIT");
      return {
        hotelId,
        appId,
        appInstallationKey,
        status: "ONBOARDING",
        nextStep: "Complete brand assets, reservation mapping and app validation",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") throw new AppError("CONFLICT", 409);
      throw error;
    } finally {
      client.release();
    }
  }

  async listHotels() {
    const result = await this.pool.query<{
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
  }

  async createBuildJob(
    input: {
      hotelId: string;
      hotelAppId: string;
      platform: "IOS" | "ANDROID";
      profile: "DEVELOPMENT" | "PREVIEW" | "PRODUCTION";
      version: string;
    },
    actorId: string,
  ) {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO app_build_jobs (hotel_id, hotel_app_id, platform, profile, status, version, requested_by)
       VALUES ($1,$2,$3,$4,'QUEUED',$5,$6) RETURNING id`,
      [input.hotelId, input.hotelAppId, input.platform, input.profile, input.version, actorId],
    );
    return { buildJobId: result.rows[0]!.id, status: "QUEUED" as const };
  }

  async getBootstrap(appInstallationKey: string): Promise<ReturnType<typeof signBootstrapManifest>> {
    const keyHash = createHash("sha256").update(appInstallationKey).digest("hex");
    const result = await this.pool.query<{
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
}
