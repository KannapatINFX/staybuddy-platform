import { describe, expect, it } from "vitest";
import { resolveHotelDeepLink } from "./deep-links";
import type { CompiledTenant } from "../config/compiled";

const tenant = {
  hotelId: "hotel-andaman-bay",
  appId: "app-andaman-bay",
  appInstallationKey: "andaman-bay-public-app-key-v1",
  displayName: "Andaman Bay",
  defaultLocale: "th",
  supportedLocales: ["en", "th", "zh-CN", "ru"],
  bootstrapPublicKeyHex: "4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29",
  theme: {
    primary: "#123B3A",
    accent: "#D2A85A",
    canvas: "#FFF9EF",
    surfaceWarm: "#EDE2CF",
    ink: "#173332",
    divider: "#E3ECE9",
    logoUrl: "https://assets.example.invalid/andaman/logo.png",
  },
  deepLinks: {
    scheme: "andamanbay",
    universalLinkOrigin: "https://andaman-bay.example.invalid",
    installLandingUrl: "https://andaman-bay.example.invalid/install",
    allowedRoutes: ["welcome", "claim", "concierge", "services", "stay", "requests", "orders", "inbox"],
  },
} satisfies CompiledTenant;

describe("hotel-pinned deep links", () => {
  it("accepts the compiled scheme and universal-link host", () => {
    expect(resolveHotelDeepLink("andamanbay://claim/opaque-value", tenant)).toEqual({
      route: "claim",
      segments: ["opaque-value"],
    });
    expect(resolveHotelDeepLink("https://andaman-bay.example.invalid/services/spa", tenant)).toEqual({
      route: "services",
      segments: ["spa"],
    });
  });

  it("rejects another hotel's host, unknown routes and tenant overrides", () => {
    expect(() => resolveHotelDeepLink("https://cc-phuket.example.invalid/claim/value", tenant)).toThrow(
      "DEEP_LINK_APP_IDENTITY_MISMATCH",
    );
    expect(() => resolveHotelDeepLink("andamanbay://hotel-selector", tenant)).toThrow(
      "DEEP_LINK_ROUTE_NOT_ALLOWED",
    );
    expect(() => resolveHotelDeepLink("andamanbay://claim/value?hotelId=hotel-other", tenant)).toThrow(
      "DEEP_LINK_TENANT_OVERRIDE_PROHIBITED",
    );
  });
});
