import { randomUUID } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { deriveBootstrapPublicKey, verifyBootstrapManifest } from "@staybuddy/contracts";
import { createDatabasePool, runMigrations, type DatabasePool } from "@staybuddy/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/main.js";

type HotelSetup = {
  hotelId: string;
  appId: string;
  appInstallationKey: string;
};

type GuestSession = {
  accountId: string;
  sessionId: string;
  accessToken: string;
};

const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";
const publicKey = deriveBootstrapPublicKey(privateKey);

process.env.NODE_ENV = "test";
process.env.BOOTSTRAP_PRIVATE_KEY_HEX = privateKey;
process.env.EMAIL_LOOKUP_HMAC_SECRET = "integration-email-hmac-secret-at-least-32-bytes";
process.env.PII_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString("base64");
process.env.OTP_PEPPER = "integration-otp-pepper-secret-at-least-32-bytes";
process.env.GUEST_JWT_SECRET = "integration-guest-jwt-secret-at-least-32-bytes";
process.env.STAFF_JWT_SECRET = "integration-staff-jwt-secret-at-least-32-bytes";
process.env.ALLOW_TEST_OTP = "true";
process.env.ALLOW_TEST_OAUTH = "true";
process.env.ALLOW_DEBUG_AUTH = "true";

const platformActorId = randomUUID();
const appOpsActorId = randomUUID();
const supportActorId = randomUUID();
const hotelAStaffId = randomUUID();
const hotelBStaffId = randomUUID();
const staffByHotel = new Map<string, string>();

function decode<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function hotelHeaders(hotelId: string) {
  const actorId = staffByHotel.get(hotelId);
  if (!actorId) throw new Error(`No integration staff configured for hotel ${hotelId}`);
  return {
    "x-debug-hotel-id": hotelId,
    "x-debug-hotel-role": "FRONT_DESK",
    "x-debug-actor-id": actorId,
  };
}

describe.sequential("StayBuddy phase-0 API", () => {
  let app: NestFastifyApplication;
  let api: FastifyInstance;
  let adminPool: DatabasePool;
  let hotelA: HotelSetup;
  let hotelB: HotelSetup;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for integration tests");
    adminPool = createDatabasePool();
    await runMigrations(adminPool);
    for (const [actorId, role] of [
      [platformActorId, "STAYBUDDY_SUPER_ADMIN"],
      [appOpsActorId, "STAYBUDDY_APP_OPS"],
      [supportActorId, "STAYBUDDY_SUPPORT"],
    ] as const) {
      await adminPool.query(
        `INSERT INTO platform_identities (id,subject,email_hash,encrypted_email,status)
         VALUES ($1,$2,$3,$4,'ACTIVE') ON CONFLICT (id) DO NOTHING`,
        [actorId, `integration:${actorId}`, `hash:${actorId}`, "encrypted"],
      );
      await adminPool.query(
        `INSERT INTO platform_role_grants (platform_identity_id,role,status,granted_by)
         VALUES ($1,$2,'ACTIVE','integration')
         ON CONFLICT (platform_identity_id,role) DO UPDATE SET status='ACTIVE'`,
        [actorId, role],
      );
    }
    app = await createApp();
    api = app.getHttpAdapter().getInstance() as FastifyInstance;
  });

  afterAll(async () => {
    await app?.close();
    await adminPool?.end();
  });

  it("returns database-backed health with safe correlation headers", async () => {
    const response = await api.inject({
      method: "GET",
      url: "/v1/health",
      headers: { "x-correlation-id": "integration-health-check" },
    });
    expect(response.statusCode).toBe(200);
    expect(decode<{ status: string; database: string }>(response)).toMatchObject({
      status: "ok",
      database: "reachable",
    });
    expect(response.headers["x-correlation-id"]).toBe("integration-health-check");
    expect(response.headers["x-trace-id"]).toMatch(/^[A-Za-z0-9-]{1,64}$/);
  });

  it("returns a safe validation error for an incomplete onboarding command", async () => {
    const response = await api.inject({
      method: "POST",
      url: "/v1/ops/hotels",
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": platformActorId,
        "idempotency-key": `invalid-${randomUUID()}`,
      },
      payload: { slug: "incomplete" },
    });
    expect(response.statusCode).toBe(400);
    expect(decode<{ code: string; metadata: { field: string } }>(response)).toMatchObject({
      code: "INVALID_REQUEST",
      metadata: { field: expect.any(String) },
    });
  });

  it("onboards two isolated hotels and returns a verifiable signed bootstrap", async () => {
    const create = async (slug: string, displayName: string, idempotencyKey: string) => {
      const packageName = slug.replaceAll("-", "");
      const payload = {
        slug,
        legalName: `${displayName} Company Limited`,
        displayName,
        roomCount: 88,
        timezone: "Asia/Bangkok",
        countryCode: "TH",
        location: { name: displayName, province: "Phuket", district: "Mueang Phuket" },
        primaryContact: {
          name: "Integration Owner",
          email: `owner+${slug}@example.com`,
          phone: "+66812345678",
        },
        salesReference: `SALES-${slug}`,
        app: {
          appName: displayName,
          scheme: slug,
          iosBundleIdentifier: `com.staybuddy.${packageName}`,
          androidPackage: `com.staybuddy.${packageName}`,
          minimumVersion: "1.0.0",
        },
        brand: {
          theme: {
            primary: "#102A43",
            accent: "#C9A45C",
            canvas: "#FCF9F3",
            surfaceWarm: "#EFE6D7",
            ink: "#152535",
            divider: "#EDF1F3",
            logoUrl: `https://assets.example.invalid/${slug}/logo.png`,
            heroImageUrl: `https://assets.example.invalid/${slug}/hero.jpg`,
          },
          supportedLocales: ["en", "th", "zh-CN", "ru"],
          defaultLocale: "en",
          voiceProfile: "FIVE_STAR_RESORT",
        },
        departments: [
          { code: "FRONT", name: "Front Desk", defaultSlaMinutes: 10 },
          { code: "HOUSEKEEPING", name: "Housekeeping", defaultSlaMinutes: 15 },
        ],
        serviceCategories: [
          { code: "GUEST_REQUESTS", name: "Guest Requests", departmentCode: "FRONT" },
          { code: "ROOM_CARE", name: "Room Care", departmentCode: "HOUSEKEEPING" },
        ],
        features: { guestShell: true, reservationCsv: true, stayClaim: true, emailOtp: true },
        commercial: { discountMinor: 0 },
      };
      const response = await api.inject({
        method: "POST",
        url: "/v1/ops/hotels",
        headers: {
          "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
          "x-debug-actor-id": platformActorId,
          "idempotency-key": idempotencyKey,
        },
        payload,
      });
      expect(response.statusCode).toBe(201);
      return { response: decode<{ body: HotelSetup; replayed: boolean }>(response), payload };
    };

    const hotelAKey = `hotel-create-${randomUUID()}`;
    const createdA = await create(
      `integration-a-${randomUUID().slice(0, 8)}`,
      "Integration Hotel A",
      hotelAKey,
    );
    hotelA = createdA.response.body;
    const replayA = await api.inject({
      method: "POST",
      url: "/v1/ops/hotels",
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": platformActorId,
        "idempotency-key": hotelAKey,
      },
      payload: createdA.payload,
    });
    expect(decode<{ body: HotelSetup; replayed: boolean }>(replayA)).toMatchObject({
      body: { hotelId: hotelA.hotelId },
      replayed: true,
    });
    const mismatchedReplay = await api.inject({
      method: "POST",
      url: "/v1/ops/hotels",
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": platformActorId,
        "idempotency-key": hotelAKey,
      },
      payload: { ...createdA.payload, displayName: "Changed replay" },
    });
    expect(mismatchedReplay.statusCode).toBe(409);
    expect(decode<{ code: string }>(mismatchedReplay).code).toBe("IDEMPOTENCY_KEY_REUSED");
    hotelB = (
      await create(
        `integration-b-${randomUUID().slice(0, 8)}`,
        "Integration Hotel B",
        `hotel-create-${randomUUID()}`,
      )
    ).response.body;
    expect(hotelA.appInstallationKey).not.toBe(hotelB.appInstallationKey);
    staffByHotel.set(hotelA.hotelId, hotelAStaffId);
    staffByHotel.set(hotelB.hotelId, hotelBStaffId);

    for (const [staffId, hotelId] of [
      [hotelAStaffId, hotelA.hotelId],
      [hotelBStaffId, hotelB.hotelId],
    ]) {
      await adminPool.query(
        `INSERT INTO staff_identities (id,email_hash,encrypted_email,status)
         VALUES ($1,$2,$3,'ACTIVE') ON CONFLICT (id) DO UPDATE SET status='ACTIVE'`,
        [staffId, `hash:${staffId}`, "encrypted"],
      );
      await adminPool.query(
        `INSERT INTO hotel_memberships (hotel_id,staff_identity_id,role,status)
         VALUES ($1,$2,'FRONT_DESK','ACTIVE')
         ON CONFLICT (hotel_id,staff_identity_id) DO UPDATE SET role='FRONT_DESK',status='ACTIVE'`,
        [hotelId, staffId],
      );
    }

    const bootstrap = await api.inject({
      method: "GET",
      url: "/v1/mobile/bootstrap",
      headers: { "x-app-installation-key": hotelA.appInstallationKey, "x-app-version": "1.0.0" },
    });
    expect(bootstrap.statusCode).toBe(200);
    const signed = decode<Parameters<typeof verifyBootstrapManifest>[0]>(bootstrap);
    expect(verifyBootstrapManifest(signed, publicKey)).toBe(true);
    expect(signed.manifest.hotelId).toBe(hotelA.hotelId);
    expect(signed.manifest.configVersion).toBe(1);
    expect(signed.manifest.versionPolicy).toBe("SUPPORTED");
    expect(signed.manifest.supportedLocales).toEqual(["en", "th", "zh-CN", "ru"]);
    expect(JSON.stringify(signed)).not.toContain(hotelA.appInstallationKey);

    const detailResponse = await api.inject({
      method: "GET",
      url: `/v1/ops/hotels/${hotelA.hotelId}`,
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": platformActorId,
      },
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(
      decode<{ primaryContact: { email: string }; onboarding: unknown[] }>(detailResponse),
    ).toMatchObject({
      primaryContact: { email: expect.stringContaining("owner+") },
    });
    expect(decode<{ onboarding: unknown[] }>(detailResponse).onboarding).toHaveLength(13);

    const published = await api.inject({
      method: "PATCH",
      url: `/v1/ops/hotels/${hotelA.hotelId}/config`,
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": platformActorId,
        "idempotency-key": `config-${randomUUID()}`,
      },
      payload: {
        appName: "Integration Hotel A Guest",
        hotelDisplayName: "Integration Hotel A",
        theme: createdA.payload.brand.theme,
        supportedLocales: ["en", "th", "zh-CN", "ru"],
        defaultLocale: "th",
        voiceProfile: "FIVE_STAR_BOUTIQUE",
        features: { guestShell: true, reservationCsv: true, stayClaim: true, emailOtp: true },
        minimumVersion: "2.0.0",
        maintenance: { active: false },
        departments: createdA.payload.departments,
        serviceCategories: createdA.payload.serviceCategories,
      },
    });
    expect(published.statusCode).toBe(200);
    expect(decode<{ body: { configVersion: number } }>(published).body.configVersion).toBe(2);
    const updatedBootstrap = await api.inject({
      method: "GET",
      url: "/v1/mobile/bootstrap",
      headers: { "x-app-installation-key": hotelA.appInstallationKey, "x-app-version": "1.5.0" },
    });
    const updatedSigned = decode<Parameters<typeof verifyBootstrapManifest>[0]>(updatedBootstrap);
    expect(verifyBootstrapManifest(updatedSigned, publicKey)).toBe(true);
    expect(updatedSigned.manifest).toMatchObject({
      configVersion: 2,
      appName: "Integration Hotel A Guest",
      defaultLocale: "th",
      versionPolicy: "UPDATE_REQUIRED",
    });
    expect(updatedBootstrap.headers["cache-control"]).toContain("max-age=300");
    expect(updatedBootstrap.headers.vary).toContain("X-App-Installation-Key");
    const cachedBootstrap = await api.inject({
      method: "GET",
      url: "/v1/mobile/bootstrap",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        "x-app-version": "1.5.0",
        "if-none-match": String(updatedBootstrap.headers.etag),
      },
    });
    expect(cachedBootstrap.statusCode).toBe(304);
    expect(cachedBootstrap.body).toBe("");
    const protectedContact = await adminPool.query<{
      encrypted_primary_contact_email: string;
      primary_contact_email_hash: string;
    }>(
      "SELECT encrypted_primary_contact_email, primary_contact_email_hash FROM hotel_onboarding_profiles WHERE hotel_id=$1",
      [hotelA.hotelId],
    );
    expect(protectedContact.rows[0]!.encrypted_primary_contact_email).not.toContain("owner+");
    expect(protectedContact.rows[0]!.primary_contact_email_hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      adminPool.query(
        "UPDATE hotel_public_config_versions SET public_config='{}' WHERE hotel_id=$1 AND version=2",
        [hotelA.hotelId],
      ),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("rejects cross-hotel membership reuse and claimed role elevation", async () => {
    const crossHotel = await api.inject({
      method: "GET",
      url: "/v1/admin/reservations",
      headers: {
        "x-debug-hotel-id": hotelB.hotelId,
        "x-debug-hotel-role": "FRONT_DESK",
        "x-debug-actor-id": hotelAStaffId,
      },
    });
    expect(crossHotel.statusCode).toBe(403);
    const elevation = await api.inject({
      method: "GET",
      url: "/v1/admin/reservations",
      headers: {
        "x-debug-hotel-id": hotelA.hotelId,
        "x-debug-hotel-role": "HOTEL_OWNER",
        "x-debug-actor-id": hotelAStaffId,
      },
    });
    expect(elevation.statusCode).toBe(403);

    await adminPool.query(
      "UPDATE hotel_memberships SET status='SUSPENDED' WHERE hotel_id=$1 AND staff_identity_id=$2",
      [hotelA.hotelId, hotelAStaffId],
    );
    const suspended = await api.inject({
      method: "GET",
      url: "/v1/admin/reservations",
      headers: hotelHeaders(hotelA.hotelId),
    });
    expect(suspended.statusCode).toBe(403);
    await adminPool.query(
      "UPDATE hotel_memberships SET status='ACTIVE' WHERE hotel_id=$1 AND staff_identity_id=$2",
      [hotelA.hotelId, hotelAStaffId],
    );

    const unknownPlatformActor = await api.inject({
      method: "GET",
      url: "/v1/ops/hotels",
      headers: {
        "x-platform-role": "STAYBUDDY_SUPER_ADMIN",
        "x-debug-actor-id": randomUUID(),
      },
    });
    expect(unknownPlatformActor.statusCode).toBe(403);
  });

  it("isolates hotel app build lanes and preserves deterministic status history", async () => {
    const appOpsHeaders = {
      "x-platform-role": "STAYBUDDY_APP_OPS",
      "x-debug-actor-id": appOpsActorId,
    };
    const configure = async (hotel: HotelSetup) => {
      const app = await adminPool.query<{ scheme: string }>("SELECT scheme FROM hotel_apps WHERE id=$1", [
        hotel.appId,
      ]);
      const scheme = app.rows[0]!.scheme;
      const payload = {
        deepLinks: {
          scheme,
          universalLinkOrigin: `https://${scheme}.example.invalid`,
          installLandingUrl: `https://${scheme}.example.invalid/install`,
          allowedRoutes: ["welcome", "claim", "concierge", "services", "stay", "requests", "orders", "inbox"],
        },
        assets: {
          status: "SYNTHETIC",
          icon: { path: `${scheme}/icon.png`, sha256: "1".repeat(64), width: 1024, height: 1024 },
          adaptiveIcon: {
            path: `${scheme}/adaptive-icon.png`,
            sha256: "2".repeat(64),
            width: 1024,
            height: 1024,
          },
          splash: { path: `${scheme}/splash.png`, sha256: "3".repeat(64), width: 1284, height: 2778 },
        },
        storeListing: {
          privacyUrl: `https://${scheme}.example.invalid/privacy`,
          supportUrl: `https://${scheme}.example.invalid/support`,
          locales: ["en", "th", "zh-CN", "ru"].map((locale) => ({
            locale,
            title: "Integration Hotel",
            subtitle: "Your hotel concierge",
            description: "A dedicated hotel companion for service and support throughout every stay.",
            keywords: ["hotel", "concierge"],
          })),
        },
      };
      const response = await api.inject({
        method: "PATCH",
        url: `/v1/ops/hotel-apps/${hotel.appId}/build-config`,
        headers: {
          ...appOpsHeaders,
          "idempotency-key": `build-config-${randomUUID()}`,
        },
        payload,
      });
      expect(response.statusCode).toBe(200);
    };
    await configure(hotelA);
    await configure(hotelB);

    const queue = async (hotel: HotelSetup) => {
      const response = await api.inject({
        method: "POST",
        url: "/v1/ops/app-builds",
        headers: {
          ...appOpsHeaders,
          "idempotency-key": `build-${randomUUID()}`,
        },
        payload: {
          hotelId: hotel.hotelId,
          hotelAppId: hotel.appId,
          platform: "IOS",
          profile: "PREVIEW",
          version: "1.0.0",
          commitSha: "abcdef1234567890",
        },
      });
      expect(response.statusCode).toBe(201);
      return decode<{ body: { buildJobId: string } }>(response).body.buildJobId;
    };
    const buildA = await queue(hotelA);
    const buildB = await queue(hotelB);
    const transition = async (
      buildJobId: string,
      payload: { status: string; failureCode?: string; artifactReference?: string },
    ) => {
      const response = await api.inject({
        method: "PATCH",
        url: `/v1/ops/app-builds/${buildJobId}/status`,
        headers: {
          ...appOpsHeaders,
          "idempotency-key": `build-status-${randomUUID()}`,
        },
        payload,
      });
      expect(response.statusCode).toBe(200);
    };
    await transition(buildA, { status: "VALIDATING" });
    await transition(buildA, { status: "FAILED", failureCode: "ASSET_VALIDATION_FAILED" });
    await transition(buildB, { status: "VALIDATING" });
    await transition(buildB, { status: "BUILDING" });
    await transition(buildB, { status: "BUILT", artifactReference: "local://hotel-b-ios" });

    const queueResponse = await api.inject({
      method: "GET",
      url: "/v1/ops/app-builds",
      headers: appOpsHeaders,
    });
    const builds = decode<Array<{ id: string; hotelId: string; status: string }>>(queueResponse);
    expect(builds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: buildA, hotelId: hotelA.hotelId, status: "FAILED" }),
        expect.objectContaining({ id: buildB, hotelId: hotelB.hotelId, status: "BUILT" }),
      ]),
    );
    const detail = await api.inject({
      method: "GET",
      url: `/v1/ops/app-builds/${buildB}`,
      headers: {
        "x-platform-role": "STAYBUDDY_SUPPORT",
        "x-debug-actor-id": supportActorId,
      },
    });
    expect(decode<{ events: unknown[] }>(detail).events).toHaveLength(4);

    const invalidTerminalRewrite = await api.inject({
      method: "PATCH",
      url: `/v1/ops/app-builds/${buildA}/status`,
      headers: {
        ...appOpsHeaders,
        "idempotency-key": `build-status-${randomUUID()}`,
      },
      payload: { status: "BUILDING" },
    });
    expect(invalidTerminalRewrite.statusCode).toBe(409);

    const supportMutation = await api.inject({
      method: "POST",
      url: "/v1/ops/app-builds",
      headers: {
        "x-platform-role": "STAYBUDDY_SUPPORT",
        "x-debug-actor-id": supportActorId,
        "idempotency-key": `support-build-${randomUUID()}`,
      },
      payload: {
        hotelId: hotelA.hotelId,
        hotelAppId: hotelA.appId,
        platform: "ANDROID",
        profile: "PREVIEW",
        version: "1.0.0",
        commitSha: "abcdef1234567890",
      },
    });
    expect(supportMutation.statusCode).toBe(403);

    const event = await adminPool.query<{ id: string }>(
      "SELECT id FROM app_build_status_events WHERE app_build_job_id=$1 ORDER BY occurred_at LIMIT 1",
      [buildB],
    );
    await expect(
      adminPool.query("UPDATE app_build_status_events SET status='FAILED' WHERE id=$1", [event.rows[0]!.id]),
    ).rejects.toMatchObject({ code: "55000" });
  });

  it("previews, commits and safely replays a mixed reservation import", async () => {
    const checkIn = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const checkOut = new Date(Date.now() + 6 * 86_400_000).toISOString();
    const staleCheckout = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const updatedAt = new Date().toISOString();
    const csv = [
      "reservation_id,status,source,confirmation,guest_name,guest_email,nationality,language,check_in,check_out,room_type,room_number,adults,children,updated_at",
      `A-100,CONFIRMED,DIRECT,CNF-A100,Ada Lovelace,guest@example.com,GB,en,${checkIn},${checkOut},Ocean Suite,701,2,0,${updatedAt}`,
      `A-200,CONFIRMED,AGENT,CNF-A200,Grace Hopper,grace@example.com,US,en,${checkIn},${checkOut},Garden Suite,702,1,0,${updatedAt}`,
      `A-BAD,CONFIRMED,DIRECT,CNF-BAD,Bad Date,bad@example.com,TH,th,${checkIn},${staleCheckout},Deluxe,703,2,0,${updatedAt}`,
    ].join("\n");
    const mapping = {
      sourceSystem: "INTEGRATION_CSV",
      columns: {
        externalReservationId: "reservation_id",
        status: "status",
        bookingSource: "source",
        confirmationCode: "confirmation",
        guestName: "guest_name",
        guestEmail: "guest_email",
        nationality: "nationality",
        preferredLanguage: "language",
        checkInAt: "check_in",
        checkOutAt: "check_out",
        roomType: "room_type",
        roomNumber: "room_number",
        adults: "adults",
        children: "children",
        updatedAtSource: "updated_at",
      },
      defaults: { timezone: "Asia/Bangkok" },
    };
    const previewResponse = await api.inject({
      method: "POST",
      url: "/v1/admin/reservation-imports/preview",
      headers: hotelHeaders(hotelA.hotelId),
      payload: { csv, mapping },
    });
    expect(previewResponse.statusCode).toBe(201);
    const preview = decode<{
      batchId: string;
      totalRows: number;
      validRows: number;
      rejectedRows: unknown[];
      reservations: unknown[];
    }>(previewResponse);
    expect(preview).toMatchObject({ totalRows: 3, validRows: 2 });
    expect(preview.rejectedRows).toHaveLength(1);

    const payload = { preview, mapping, mappingName: "Integration profile" };
    const idempotencyKey = `reservation-import-${randomUUID()}`;
    const first = await api.inject({
      method: "POST",
      url: "/v1/admin/reservation-imports/commit",
      headers: { ...hotelHeaders(hotelA.hotelId), "idempotency-key": idempotencyKey },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(decode<{ replayed: boolean; body: { created: number; rejected: number } }>(first)).toMatchObject({
      replayed: false,
      body: { created: 2, rejected: 1 },
    });

    const replay = await api.inject({
      method: "POST",
      url: "/v1/admin/reservation-imports/commit",
      headers: { ...hotelHeaders(hotelA.hotelId), "idempotency-key": idempotencyKey },
      payload,
    });
    expect(decode<{ replayed: boolean }>(replay).replayed).toBe(true);
  });

  it("keeps pre-arrival low-trust, enforces consent and unlocks in-house only after claim", async () => {
    const arrivalsResponse = await api.inject({
      method: "GET",
      url: `/v1/admin/reservations?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(
        new Date(Date.now() + 20 * 86_400_000).toISOString(),
      )}`,
      headers: hotelHeaders(hotelA.hotelId),
    });
    const arrivals = decode<Array<{ stayId: string }>>(arrivalsResponse);
    expect(arrivals).toHaveLength(2);
    const [primaryStay, secondaryStay] = arrivals.map((arrival) => arrival.stayId);

    const invitationIssue = await api.inject({
      method: "POST",
      url: `/v1/admin/stays/${primaryStay}/prearrival-invitations`,
      headers: hotelHeaders(hotelA.hotelId),
    });
    const invitation = decode<{ opaqueToken: string }>(invitationIssue);
    const invitationScan = await api.inject({
      method: "POST",
      url: "/v1/prearrival-invitations/scan",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        "x-installation-id": "installation-primary",
      },
      payload: { opaqueToken: invitation.opaqueToken },
    });
    const invitationSession = decode<{ invitationSessionId: string; preview: { guestNameMasked: string } }>(
      invitationScan,
    );
    expect(invitationSession.preview.guestNameMasked).toBe("A*** L***");

    const hotelBCrossTenant = await api.inject({
      method: "POST",
      url: "/v1/prearrival-invitations/scan",
      headers: { "x-app-installation-key": hotelB.appInstallationKey },
      payload: { opaqueToken: invitation.opaqueToken },
    });
    expect(hotelBCrossTenant.statusCode).toBe(404);

    const authenticate = async (hotel: HotelSetup, installationId: string): Promise<GuestSession> => {
      const start = await api.inject({
        method: "POST",
        url: "/v1/auth/email/start",
        headers: { "x-app-installation-key": hotel.appInstallationKey },
        payload: { email: "guest@example.com", installationId },
      });
      const challenge = decode<{ challengeId: string; debugCode: string }>(start);
      const verify = await api.inject({
        method: "POST",
        url: "/v1/auth/email/verify",
        headers: { "x-app-installation-key": hotel.appInstallationKey },
        payload: { challengeId: challenge.challengeId, code: challenge.debugCode, installationId },
      });
      expect(verify.statusCode).toBe(201);
      return decode<GuestSession>(verify);
    };

    const guestA = await authenticate(hotelA, "installation-primary");
    const repeatGuestA = await authenticate(hotelA, "installation-repeat");
    const guestB = await authenticate(hotelB, "installation-other-hotel");
    expect(repeatGuestA.accountId).toBe(guestA.accountId);
    expect(guestB.accountId).not.toBe(guestA.accountId);

    const completeBeforeTerms = await api.inject({
      method: "POST",
      url: "/v1/prearrival-invitations/complete",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        authorization: `Bearer ${guestA.accessToken}`,
      },
      payload: {
        invitationSessionId: invitationSession.invitationSessionId,
        acceptedTermsVersion: "2026-08",
      },
    });
    expect(completeBeforeTerms.statusCode).toBe(409);
    expect(decode<{ code: string }>(completeBeforeTerms).code).toBe("TERMS_REQUIRED");

    for (const purpose of ["TERMS", "PRIVACY"] as const) {
      const consent = await api.inject({
        method: "POST",
        url: "/v1/consents",
        headers: {
          "x-app-installation-key": hotelA.appInstallationKey,
          authorization: `Bearer ${guestA.accessToken}`,
        },
        payload: {
          purpose,
          channel: "SERVICE",
          granted: true,
          definitionVersion: "2026-08",
          locale: "en",
          source: "ONBOARDING",
        },
      });
      expect(consent.statusCode).toBe(201);
    }

    const prearrivalComplete = await api.inject({
      method: "POST",
      url: "/v1/prearrival-invitations/complete",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        authorization: `Bearer ${guestA.accessToken}`,
      },
      payload: {
        invitationSessionId: invitationSession.invitationSessionId,
        acceptedTermsVersion: "2026-08",
      },
    });
    expect(
      decode<{ lifecycle: string; sensitiveRoomDataUnlocked: boolean }>(prearrivalComplete),
    ).toMatchObject({
      lifecycle: "PRE_ARRIVAL_ACTIVATED",
      sensitiveRoomDataUnlocked: false,
    });

    const pushDeclined = await api.inject({
      method: "POST",
      url: "/v1/me/devices/push-permission",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        authorization: `Bearer ${guestA.accessToken}`,
      },
      payload: { installationId: "installation-primary", status: "DECLINED" },
    });
    expect(decode<{ status: string }>(pushDeclined).status).toBe("DECLINED");

    const claimIssue = await api.inject({
      method: "POST",
      url: `/v1/admin/stays/${primaryStay}/claims`,
      headers: hotelHeaders(hotelA.hotelId),
      payload: { roomNumber: "701", ttlMinutes: 30 },
    });
    const claim = decode<{ opaqueToken: string }>(claimIssue);
    const claimScan = await api.inject({
      method: "POST",
      url: "/v1/stay-claims/scan",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        "x-installation-id": "installation-primary",
      },
      payload: { opaqueToken: claim.opaqueToken },
    });
    const claimSession = decode<{ claimSessionId: string }>(claimScan);
    const claimCompletePayload = {
      claimSessionId: claimSession.claimSessionId,
      accountId: guestA.accountId,
      acceptedTermsVersion: "2026-08",
    };
    const claimComplete = await api.inject({
      method: "POST",
      url: "/v1/stay-claims/complete",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        authorization: `Bearer ${guestA.accessToken}`,
      },
      payload: claimCompletePayload,
    });
    expect(decode<{ lifecycle: string }>(claimComplete).lifecycle).toBe("IN_HOUSE");

    const replay = await api.inject({
      method: "POST",
      url: "/v1/stay-claims/complete",
      headers: {
        "x-app-installation-key": hotelA.appInstallationKey,
        authorization: `Bearer ${guestA.accessToken}`,
      },
      payload: claimCompletePayload,
    });
    expect(replay.statusCode).toBe(409);
    expect(decode<{ code: string }>(replay).code).toBe("CLAIM_REPLAYED");

    const expiredIssue = await api.inject({
      method: "POST",
      url: `/v1/admin/stays/${secondaryStay}/claims`,
      headers: hotelHeaders(hotelA.hotelId),
      payload: { roomNumber: "702", ttlMinutes: 30 },
    });
    const expiredClaim = decode<{ claimId: string; opaqueToken: string }>(expiredIssue);
    await adminPool.query("UPDATE stay_claims SET expires_at=now()-interval '1 second' WHERE id=$1", [
      expiredClaim.claimId,
    ]);
    const expiredScan = await api.inject({
      method: "POST",
      url: "/v1/stay-claims/scan",
      headers: { "x-app-installation-key": hotelA.appInstallationKey },
      payload: { opaqueToken: expiredClaim.opaqueToken },
    });
    expect(expiredScan.statusCode).toBe(410);
    expect(decode<{ code: string }>(expiredScan).code).toBe("CLAIM_EXPIRED");
  });
});
