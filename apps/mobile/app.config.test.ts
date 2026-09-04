import type { ConfigContext, ExpoConfig } from "expo/config";
import { afterEach, describe, expect, it } from "vitest";
import createAppConfig from "./app.config";

afterEach(() => {
  delete process.env.STAYBUDDY_TENANT;
});

describe("mobile tenant build harness", () => {
  it("compiles one immutable hotel identity without a hotel selector", () => {
    process.env.STAYBUDDY_TENANT = "andaman-bay-demo";
    const context = { config: { name: "base", slug: "base" } as ExpoConfig } as ConfigContext;
    const result = createAppConfig(context);
    const tenant = result.extra?.tenant as {
      hotelId: string;
      appInstallationKey: string;
      deepLinks: { scheme: string; universalLinkOrigin: string };
    };

    expect(result.ios?.bundleIdentifier).toBe("com.staybuddy.andamanbaydemo");
    expect(result.android?.package).toBe("com.staybuddy.andamanbaydemo");
    expect(tenant.hotelId).toBeTruthy();
    expect(tenant.appInstallationKey).toBeTruthy();
    expect(result.scheme).toBe("andamanbay");
    expect(result.ios?.associatedDomains).toEqual(["applinks:andaman-bay.example.invalid"]);
    expect(tenant.deepLinks.universalLinkOrigin).toBe("https://andaman-bay.example.invalid");
    expect(JSON.stringify(result)).not.toContain("hotelSelector");
  });
});
