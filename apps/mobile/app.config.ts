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
  defaultLocale: "en" | "th" | "zh-CN" | "ru";
  supportedLocales: ("en" | "th" | "zh-CN" | "ru")[];
  bootstrapPublicKeyHex: string;
  theme: {
    primary: string;
    accent: string;
    canvas: string;
    surfaceWarm: string;
    ink: string;
    divider: string;
    logoUrl: string;
    heroImageUrl?: string;
  };
  deepLinks: {
    scheme: string;
    universalLinkOrigin: string;
    installLandingUrl: string;
    allowedRoutes: string[];
  };
  assets: {
    icon: { path: string };
    adaptiveIcon: { path: string };
    splash: { path: string };
  };
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const tenantSlug = process.env.STAYBUDDY_TENANT ?? "cc-phuket-residence";
  const workspaceRoot = path.resolve(process.cwd(), "../..");
  const configPath = path.join(workspaceRoot, "config", "tenants", tenantSlug, "app.json");
  const tenant = JSON.parse(readFileSync(configPath, "utf8")) as TenantAppConfig;
  const appVersion = process.env.STAYBUDDY_APP_VERSION ?? "1.0.0";
  const universalLink = new URL(tenant.deepLinks.universalLinkOrigin);
  return {
    ...config,
    name: tenant.appName,
    slug: tenant.slug,
    version: appVersion,
    orientation: "portrait",
    scheme: tenant.deepLinks.scheme,
    icon: path.join(workspaceRoot, tenant.assets.icon.path),
    userInterfaceStyle: "automatic",
    plugins: [
      "expo-router",
      "expo-notifications",
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: path.join(workspaceRoot, tenant.assets.splash.path),
          backgroundColor: tenant.theme.canvas,
          imageWidth: 240,
        },
      ],
    ],
    experiments: { typedRoutes: true },
    ios: {
      bundleIdentifier: tenant.iosBundleIdentifier,
      supportsTablet: true,
      associatedDomains: [`applinks:${universalLink.host}`],
    },
    android: {
      package: tenant.androidPackage,
      adaptiveIcon: {
        foregroundImage: path.join(workspaceRoot, tenant.assets.adaptiveIcon.path),
        backgroundColor: tenant.theme.canvas,
      },
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [{ scheme: "https", host: universalLink.host, pathPrefix: "/" }],
        },
      ],
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
        deepLinks: tenant.deepLinks,
      },
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
    },
  };
};
