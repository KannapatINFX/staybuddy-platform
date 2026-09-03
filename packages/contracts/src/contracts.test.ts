import { describe, expect, it } from "vitest";
import {
  BootstrapManifestSchema,
  CanonicalReservationSchema,
  CreateHotelInputSchema,
  LocaleSchema,
} from "./index.js";
import { createOpenApiDocument } from "./openapi.js";
import {
  deriveBootstrapPublicKey,
  signBootstrapManifest,
  verifyBootstrapManifest,
} from "./bootstrap-signing.js";

describe("contracts", () => {
  it("locks the four launch locales", () => {
    expect(LocaleSchema.options).toEqual(["en", "th", "zh-CN", "ru"]);
  });

  it("rejects a reservation whose checkout is before check-in", () => {
    const result = CanonicalReservationSchema.safeParse({
      sourceSystem: "csv",
      externalReservationId: "R-1",
      status: "CONFIRMED",
      bookingSource: "direct",
      confirmationCode: "ABC",
      primaryGuest: { name: "Anna" },
      checkInAt: "2026-09-03T07:00:00.000Z",
      checkOutAt: "2026-09-02T07:00:00.000Z",
      timezone: "Asia/Bangkok",
      rooms: [{}],
      updatedAtSource: "2026-08-30T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("keeps the bootstrap schema and OpenAPI document aligned", () => {
    expect(BootstrapManifestSchema).toBeDefined();
    expect(createOpenApiDocument().components.schemas.BootstrapManifest).toBeDefined();
  });

  it("signs a bootstrap manifest without putting a signing secret in the mobile app", () => {
    const privateKey = "0000000000000000000000000000000000000000000000000000000000000001";
    const manifest = BootstrapManifestSchema.parse({
      schemaVersion: 1,
      configVersion: 2,
      hotelId: "hotel-cc-phuket",
      appId: "app-cc-phuket",
      appName: "CC Phuket Residence",
      hotelDisplayName: "CC Phuket Residence",
      theme: {
        primary: "#102A43",
        accent: "#C9A45C",
        canvas: "#FCF9F3",
        surfaceWarm: "#EFE6D7",
        ink: "#152535",
        divider: "#EDF1F3",
        logoUrl: "https://assets.example.invalid/logo.png",
      },
      supportedLocales: ["en", "th", "zh-CN", "ru"],
      defaultLocale: "en",
      voiceProfile: "FIVE_STAR_RESORT",
      features: { concierge: true },
      minimumVersion: "1.0.0",
      maintenance: { active: false },
      versionPolicy: "SUPPORTED",
      issuedAt: "2026-08-30T00:00:00.000Z",
      expiresAt: "2026-08-31T00:00:00.000Z",
    });
    const signed = signBootstrapManifest(manifest, privateKey);
    const publicKey = deriveBootstrapPublicKey(privateKey);
    expect(verifyBootstrapManifest(signed, publicKey)).toBe(true);
    expect(
      verifyBootstrapManifest({ ...signed, manifest: { ...manifest, appName: "Tampered" } }, publicKey),
    ).toBe(false);
    expect(JSON.stringify(signed)).not.toContain("cc-phuket-public-app-key");
  });

  it("requires a complete hotel onboarding payload", () => {
    expect(CreateHotelInputSchema.safeParse({ slug: "incomplete" }).success).toBe(false);
  });
});
