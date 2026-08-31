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

function decode<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

function hotelHeaders(hotelId: string) {
  return {
    "x-debug-hotel-id": hotelId,
    "x-debug-hotel-role": "FRONT_DESK",
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

  it("onboards two isolated hotels and returns a verifiable signed bootstrap", async () => {
    const create = async (slug: string, displayName: string) => {
      const response = await api.inject({
        method: "POST",
        url: "/v1/ops/hotels",
        headers: { "x-platform-role": "STAYBUDDY_SUPER_ADMIN" },
        payload: {
          slug,
          legalName: `${displayName} Company Limited`,
          displayName,
          roomCount: 88,
          timezone: "Asia/Bangkok",
          countryCode: "TH",
        },
      });
      expect(response.statusCode).toBe(201);
      return decode<HotelSetup>(response);
    };

    hotelA = await create(`integration-a-${randomUUID().slice(0, 8)}`, "Integration Hotel A");
    hotelB = await create(`integration-b-${randomUUID().slice(0, 8)}`, "Integration Hotel B");
    expect(hotelA.appInstallationKey).not.toBe(hotelB.appInstallationKey);

    const bootstrap = await api.inject({
      method: "GET",
      url: "/v1/mobile/bootstrap",
      headers: { "x-app-installation-key": hotelA.appInstallationKey },
    });
    expect(bootstrap.statusCode).toBe(200);
    const signed = decode<Parameters<typeof verifyBootstrapManifest>[0]>(bootstrap);
    expect(verifyBootstrapManifest(signed, publicKey)).toBe(true);
    expect(signed.manifest.hotelId).toBe(hotelA.hotelId);
    expect(signed.manifest.supportedLocales).toEqual(["en", "th", "zh-CN", "ru"]);
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
