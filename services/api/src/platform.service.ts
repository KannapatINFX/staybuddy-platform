import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  BootstrapManifestSchema,
  CreateHotelInputSchema,
  PublishHotelConfigSchema,
  signBootstrapManifest,
  type BootstrapManifest,
  type CreateHotelInput,
  type HotelConfiguration,
  type PublishHotelConfig,
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
import { SecurityService } from "./security.service.js";

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
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    private readonly security: SecurityService,
  ) {}

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

  async getBootstrap(
    appInstallationKey: string,
    appVersion?: string,
  ): Promise<ReturnType<typeof signBootstrapManifest>> {
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
          config_version: number;
          public_config: {
            appName: string;
            hotelDisplayName: string;
            minimumVersion: string;
            voiceProfile: HotelConfiguration["voiceProfile"];
            theme: HotelConfiguration["theme"];
            supportedLocales: HotelConfiguration["supportedLocales"];
            defaultLocale: HotelConfiguration["defaultLocale"];
            features: Record<string, boolean>;
            maintenance: { active: boolean; messageKey?: string };
          };
        }>(
          `SELECT h.id AS hotel_id, a.id AS app_id, a.config_version, c.public_config
           FROM hotel_apps a
           JOIN hotels h ON h.id = a.hotel_id
           JOIN hotel_public_config_versions c
             ON c.hotel_id = h.id AND c.hotel_app_id = a.id AND c.version = a.config_version
           WHERE a.app_installation_key_hash = $1 AND a.status <> 'PAUSED'
           LIMIT 1`,
          [keyHash],
        ),
    );
    const row = result.rows[0];
    if (!row) throw new AppError("NOT_FOUND", 404);
    const publicConfig = row.public_config;
    const bucketMs = 5 * 60_000;
    const now = new Date(Math.floor(Date.now() / bucketMs) * bucketMs);
    const manifest: BootstrapManifest = BootstrapManifestSchema.parse({
      schemaVersion: 1,
      configVersion: row.config_version,
      hotelId: row.hotel_id,
      appId: row.app_id,
      ...publicConfig,
      versionPolicy:
        appVersion && compareSemver(appVersion, publicConfig.minimumVersion) < 0
          ? "UPDATE_REQUIRED"
          : "SUPPORTED",
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.valueOf() + 86_400_000).toISOString(),
    });
    const privateKey = process.env.BOOTSTRAP_PRIVATE_KEY_HEX;
    if (!privateKey) throw new AppError("INTERNAL_ERROR", 500);
    return signBootstrapManifest(manifest, privateKey);
  }

  async getHotel(hotelId: string, principal: PlatformPrincipal) {
    return withPlatformTransaction(
      this.pool,
      { actorId: principal.actorId, platformRole: principal.role, traceId: randomUUID() },
      async (client) => {
        const hotel = await client.query<{
          id: string;
          slug: string;
          legal_name: string;
          display_name: string;
          status: HotelConfiguration["status"];
          timezone: string;
          country_code: string;
          room_count: number;
          sales_reference: string | null;
          encrypted_primary_contact_name: string;
          encrypted_primary_contact_email: string;
          encrypted_primary_contact_phone: string | null;
          location_name: string;
          province: string | null;
          district: string | null;
        }>(
          `SELECT h.*, p.sales_reference, p.encrypted_primary_contact_name,
                  p.encrypted_primary_contact_email, p.encrypted_primary_contact_phone,
                  l.name AS location_name, l.province, l.district
           FROM hotels h
           JOIN hotel_onboarding_profiles p ON p.hotel_id = h.id
           JOIN hotel_locations l ON l.hotel_id = h.id
           WHERE h.id = $1 LIMIT 1`,
          [hotelId],
        );
        const row = hotel.rows[0];
        if (!row) throw new AppError("NOT_FOUND", 404);
        const app = await client.query<{
          id: string;
          app_name: string;
          scheme: string;
          ios_bundle_id: string;
          android_package: string;
          status: string;
          config_version: number;
        }>("SELECT * FROM hotel_apps WHERE hotel_id=$1 LIMIT 1", [hotelId]);
        const brand = await client.query<{
          voice_profile: HotelConfiguration["voiceProfile"];
          theme: HotelConfiguration["theme"];
          supported_locales: HotelConfiguration["supportedLocales"];
          default_locale: HotelConfiguration["defaultLocale"];
        }>("SELECT * FROM hotel_brand_profiles WHERE hotel_id=$1 AND is_active", [hotelId]);
        const commercial = await client.query<{ discount_minor: number; waiver_reason: string | null }>(
          "SELECT discount_minor, waiver_reason FROM hotel_commercial_configs WHERE hotel_id=$1 ORDER BY version DESC LIMIT 1",
          [hotelId],
        );
        const departments = await client.query<{
          id: string;
          code: string;
          name: string;
          default_sla_minutes: number;
        }>(
          "SELECT id, code, name, default_sla_minutes FROM hotel_departments WHERE hotel_id=$1 AND active ORDER BY code",
          [hotelId],
        );
        const features = await client.query<{ feature_key: string; enabled: boolean }>(
          "SELECT feature_key, enabled FROM hotel_features WHERE hotel_id=$1 ORDER BY feature_key",
          [hotelId],
        );
        const serviceCategories = await client.query<{
          id: string;
          code: string;
          name: string;
          department_code: string;
        }>(
          "SELECT id, code, name, department_code FROM hotel_service_categories WHERE hotel_id=$1 AND active ORDER BY code",
          [hotelId],
        );
        const onboarding = await client.query<{ step: string; status: string }>(
          "SELECT step, status FROM hotel_onboarding_steps WHERE hotel_id=$1 ORDER BY updated_at, step",
          [hotelId],
        );
        const appRow = app.rows[0];
        const brandRow = brand.rows[0];
        const commercialRow = commercial.rows[0];
        if (!appRow || !brandRow || !commercialRow) throw new AppError("INTERNAL_ERROR", 500);
        return {
          hotel: {
            id: row.id,
            slug: row.slug,
            legalName: row.legal_name,
            displayName: row.display_name,
            status: row.status,
            timezone: row.timezone,
            countryCode: row.country_code,
            supportedLocales: brandRow.supported_locales,
            defaultLocale: brandRow.default_locale,
            voiceProfile: brandRow.voice_profile,
            theme: brandRow.theme,
            commercial: {
              roomCount: row.room_count,
              listPricePerRoomThb: 150 as const,
              minimumBillableRooms: 50 as const,
              discountMinor: commercialRow.discount_minor,
              ...(commercialRow.waiver_reason ? { waiverReason: commercialRow.waiver_reason } : {}),
              commerceCommissionBasisPoints: 500 as const,
              aiMarkupBasisPoints: 1250 as const,
            },
            departments: departments.rows.map((department) => ({
              id: department.id,
              code: department.code,
              name: department.name,
              defaultSlaMinutes: department.default_sla_minutes,
            })),
            serviceCategories: serviceCategories.rows.map((category) => ({
              id: category.id,
              code: category.code,
              name: category.name,
              departmentCode: category.department_code,
            })),
            features: Object.fromEntries(
              features.rows.map((feature) => [feature.feature_key, feature.enabled]),
            ),
          },
          app: {
            id: appRow.id,
            appName: appRow.app_name,
            scheme: appRow.scheme,
            iosBundleIdentifier: appRow.ios_bundle_id,
            androidPackage: appRow.android_package,
            status: appRow.status,
            configVersion: appRow.config_version,
          },
          location: { name: row.location_name, province: row.province, district: row.district },
          primaryContact: {
            name: this.security.decryptPii(row.encrypted_primary_contact_name),
            email: this.security.decryptPii(row.encrypted_primary_contact_email),
            phone: row.encrypted_primary_contact_phone
              ? this.security.decryptPii(row.encrypted_primary_contact_phone)
              : null,
          },
          salesReference: row.sales_reference,
          onboarding: onboarding.rows,
        };
      },
    );
  }

  async publishHotelConfig(
    hotelId: string,
    input: unknown,
    principal: PlatformPrincipal,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    const values = PublishHotelConfigSchema.parse(input);
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
            scope: `hotel.config.publish:${hotelId}`,
            key: idempotencyKey,
            request: values,
            expiresAt: new Date(Date.now() + 86_400_000),
            action: async () => ({
              status: 200,
              body: await this.persistPublishedConfig(
                client,
                hotelId,
                values,
                principal,
                idempotencyKey,
                traceId,
              ),
            }),
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

  private async persistPublishedConfig(
    client: DatabaseClient,
    hotelId: string,
    values: PublishHotelConfig,
    principal: PlatformPrincipal,
    idempotencyKey: string,
    traceId: string,
  ) {
    const app = await client.query<{ id: string; config_version: number }>(
      "SELECT id, config_version FROM hotel_apps WHERE hotel_id=$1 FOR UPDATE",
      [hotelId],
    );
    const appRow = app.rows[0];
    if (!appRow) throw new AppError("NOT_FOUND", 404);
    const nextVersion = appRow.config_version + 1;
    await client.query("UPDATE hotel_brand_profiles SET is_active=false WHERE hotel_id=$1 AND is_active", [
      hotelId,
    ]);
    await client.query(
      `INSERT INTO hotel_brand_profiles
        (hotel_id, version, is_active, voice_profile, theme, supported_locales, default_locale)
       VALUES ($1,$2,true,$3,$4,$5,$6)`,
      [
        hotelId,
        nextVersion,
        values.voiceProfile,
        JSON.stringify(values.theme),
        values.supportedLocales,
        values.defaultLocale,
      ],
    );
    await client.query("UPDATE hotel_departments SET active=false WHERE hotel_id=$1", [hotelId]);
    for (const department of values.departments) {
      await client.query(
        `INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes, active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (hotel_id, code) DO UPDATE
         SET name=EXCLUDED.name, default_sla_minutes=EXCLUDED.default_sla_minutes, active=true`,
        [hotelId, department.code, department.name, department.defaultSlaMinutes],
      );
    }
    await client.query(
      "UPDATE hotel_service_categories SET active=false, updated_at=now() WHERE hotel_id=$1",
      [hotelId],
    );
    for (const category of values.serviceCategories) {
      await client.query(
        `INSERT INTO hotel_service_categories (hotel_id, code, name, department_code, active)
         VALUES ($1,$2,$3,$4,true)
         ON CONFLICT (hotel_id, code) DO UPDATE
         SET name=EXCLUDED.name, department_code=EXCLUDED.department_code, active=true, updated_at=now()`,
        [hotelId, category.code, category.name, category.departmentCode],
      );
    }
    await client.query("DELETE FROM hotel_features WHERE hotel_id=$1", [hotelId]);
    for (const [feature, enabled] of Object.entries(values.features)) {
      await client.query("INSERT INTO hotel_features (hotel_id, feature_key, enabled) VALUES ($1,$2,$3)", [
        hotelId,
        feature,
        enabled,
      ]);
    }
    await client.query(`UPDATE hotels SET display_name=$2, updated_at=now() WHERE id=$1`, [
      hotelId,
      values.hotelDisplayName,
    ]);
    await client.query(
      `UPDATE hotel_apps
       SET app_name=$2, minimum_version=$3, maintenance_active=$4,
           maintenance_message_key=$5, config_version=$6, updated_at=now()
       WHERE id=$1`,
      [
        appRow.id,
        values.appName,
        values.minimumVersion,
        values.maintenance.active,
        values.maintenance.messageKey ?? null,
        nextVersion,
      ],
    );
    const publicConfig = {
      appName: values.appName,
      hotelDisplayName: values.hotelDisplayName,
      theme: values.theme,
      supportedLocales: values.supportedLocales,
      defaultLocale: values.defaultLocale,
      voiceProfile: values.voiceProfile,
      features: values.features,
      minimumVersion: values.minimumVersion,
      maintenance: values.maintenance,
    };
    const published = await client.query<{ published_at: Date }>(
      `INSERT INTO hotel_public_config_versions
        (hotel_id, hotel_app_id, version, public_config, published_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING published_at`,
      [hotelId, appRow.id, nextVersion, JSON.stringify(publicConfig), principal.actorId],
    );
    await client.query(
      `UPDATE hotel_onboarding_steps SET status='COMPLETE', updated_at=now()
       WHERE hotel_id=$1 AND step IN ('BRAND_APP_CONFIG','DEPARTMENTS_STAFF','SERVICE_CATALOG')`,
      [hotelId],
    );
    await appendAuditAndOutbox(client, {
      hotelId,
      actor: { type: "STAYBUDDY_STAFF", id: principal.actorId, role: principal.role },
      action: "hotel.config.updated",
      resource: { type: "hotel_public_config", id: `${hotelId}:${nextVersion}` },
      event: {
        type: "hotel.config.updated",
        aggregateType: "hotel",
        aggregateId: hotelId,
        payload: { configVersion: nextVersion },
      },
      traceId,
      correlationId: idempotencyKey,
      idempotencyKey,
      commandId: idempotencyKey,
    });
    return {
      hotelId,
      configVersion: nextVersion,
      publishedAt: published.rows[0]!.published_at.toISOString(),
    };
  }

  private async persistHotel(
    client: DatabaseClient,
    values: CreateHotelInput,
    principal: PlatformPrincipal,
    idempotencyKey: string,
    traceId: string,
  ) {
    const hotelId = randomUUID();
    const appId = randomUUID();
    const appInstallationKey = randomBytes(24).toString("base64url");
    const appKeyHash = createHash("sha256").update(appInstallationKey).digest("hex");
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
      `INSERT INTO hotel_locations (hotel_id, name, timezone, country_code, province, district)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        hotelId,
        values.location.name,
        values.timezone,
        values.countryCode,
        values.location.province ?? null,
        values.location.district ?? null,
      ],
    );
    await client.query(
      `INSERT INTO hotel_onboarding_profiles
        (hotel_id, sales_reference, encrypted_primary_contact_name, primary_contact_email_hash,
         encrypted_primary_contact_email, encrypted_primary_contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        hotelId,
        values.salesReference ?? null,
        this.security.encryptPii(values.primaryContact.name),
        this.security.emailLookupHash(hotelId, values.primaryContact.email),
        this.security.encryptPii(this.security.normalizeEmail(values.primaryContact.email)),
        values.primaryContact.phone ? this.security.encryptPii(values.primaryContact.phone) : null,
      ],
    );
    await client.query(
      `INSERT INTO hotel_apps
        (id, hotel_id, app_installation_key_hash, app_installation_key_hint, app_name, scheme,
         ios_bundle_id, android_package, minimum_version, config_version, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,'DRAFT')`,
      [
        appId,
        hotelId,
        appKeyHash,
        appInstallationKey.slice(-6),
        values.app.appName,
        values.app.scheme,
        values.app.iosBundleIdentifier,
        values.app.androidPackage,
        values.app.minimumVersion,
      ],
    );
    await client.query(
      `INSERT INTO hotel_brand_profiles
        (hotel_id, version, is_active, voice_profile, theme, supported_locales, default_locale)
       VALUES ($1,1,true,$2,$3,$4,$5)`,
      [
        hotelId,
        values.brand.voiceProfile,
        JSON.stringify(values.brand.theme),
        values.brand.supportedLocales,
        values.brand.defaultLocale,
      ],
    );
    await client.query(
      `INSERT INTO hotel_commercial_configs
        (hotel_id, version, discount_minor, waiver_reason, commerce_commission_basis_points, ai_markup_basis_points, effective_at)
       VALUES ($1,1,$2,$3,500,1250,now())`,
      [hotelId, values.commercial.discountMinor, values.commercial.waiverReason ?? null],
    );
    for (const department of values.departments) {
      await client.query(
        "INSERT INTO hotel_departments (hotel_id, code, name, default_sla_minutes) VALUES ($1,$2,$3,$4)",
        [hotelId, department.code, department.name, department.defaultSlaMinutes],
      );
    }
    for (const category of values.serviceCategories) {
      await client.query(
        `INSERT INTO hotel_service_categories (hotel_id, code, name, department_code)
         VALUES ($1,$2,$3,$4)`,
        [hotelId, category.code, category.name, category.departmentCode],
      );
    }
    for (const [feature, enabled] of Object.entries(values.features)) {
      await client.query("INSERT INTO hotel_features (hotel_id, feature_key, enabled) VALUES ($1,$2,$3)", [
        hotelId,
        feature,
        enabled,
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
    const publicConfig = {
      appName: values.app.appName,
      hotelDisplayName: values.displayName,
      theme: values.brand.theme,
      supportedLocales: values.brand.supportedLocales,
      defaultLocale: values.brand.defaultLocale,
      voiceProfile: values.brand.voiceProfile,
      features: values.features,
      minimumVersion: values.app.minimumVersion,
      maintenance: { active: false },
    };
    await client.query(
      `INSERT INTO hotel_public_config_versions
        (hotel_id, hotel_app_id, version, public_config, published_by)
       VALUES ($1,$2,1,$3,$4)`,
      [hotelId, appId, JSON.stringify(publicConfig), principal.actorId],
    );
    const completeSteps = new Set([
      "TENANT_CREATED",
      "BRAND_APP_CONFIG",
      "DEPARTMENTS_STAFF",
      "SERVICE_CATALOG",
    ]);
    for (const step of ONBOARDING_STEPS) {
      await client.query("INSERT INTO hotel_onboarding_steps (hotel_id, step, status) VALUES ($1,$2,$3)", [
        hotelId,
        step,
        completeSteps.has(step) ? "COMPLETE" : "PENDING",
      ]);
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
      nextStep: "Complete reservation mapping and knowledge bootstrap",
      configVersion: 1,
    };
  }
}

const ONBOARDING_STEPS = [
  "TENANT_CREATED",
  "BRAND_APP_CONFIG",
  "DEPARTMENTS_STAFF",
  "SERVICE_CATALOG",
  "RESERVATION_MAPPING",
  "KNOWLEDGE",
  "AUTOMATIONS",
  "BILLING_WALLET",
  "APP_BUILD",
  "QA_UAT",
  "PUBLISH",
  "PILOT",
  "LIVE",
] as const;

function compareSemver(left: string, right: string): number {
  const parsed = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    if (!match) return undefined;
    return match.slice(1).map(Number);
  };
  const a = parsed(left);
  const b = parsed(right);
  if (!a || !b) return -1;
  for (let index = 0; index < 3; index += 1) {
    if (a[index]! > b[index]!) return 1;
    if (a[index]! < b[index]!) return -1;
  }
  return 0;
}
