import type { ConfigContext, ExpoConfig } from "expo/config";
import { readFileSync } from "node:fs";
import path from "node:path";

type TenantAppConfig = {
  hotelId: string;
  appId: string;
  slug: string;
  appName: string;
  displayName: string;
  appInstallationKey: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  scheme: string;
  defaultLocale: string;
  supportedLocales: string[];
  bootstrapPublicKeyHex: string;
  theme: Record<string, string>;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const tenantSlug = process.env.STAYBUDDY_TENANT ?? "cc-phuket-residence";
  const configPath = path.resolve(process.cwd(), `../../config/tenants/${tenantSlug}/app.json`);
  const tenant = JSON.parse(readFileSync(configPath, "utf8")) as TenantAppConfig;
  return {
    ...config,
    name: tenant.appName,
    slug: tenant.slug,
    version: "1.0.0",
    orientation: "portrait",
    scheme: tenant.scheme,
    userInterfaceStyle: "automatic",
    plugins: ["expo-router", "expo-notifications", "expo-secure-store"],
    experiments: { typedRoutes: true },
    ios: { bundleIdentifier: tenant.iosBundleIdentifier, supportsTablet: true },
    android: {
      package: tenant.androidPackage,
      adaptiveIcon: { backgroundColor: tenant.theme.canvas ?? "#FCF9F3" },
    },
    web: { bundler: "metro", output: "static" },
    extra: {
      tenant: {
        hotelId: tenant.hotelId,
        appId: tenant.appId,
        appInstallationKey: tenant.appInstallationKey,
        displayName: tenant.displayName,
        defaultLocale: tenant.defaultLocale,
        supportedLocales: tenant.supportedLocales,
        bootstrapPublicKeyHex: tenant.bootstrapPublicKeyHex,
        theme: tenant.theme,
      },
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
    },
  };
};
