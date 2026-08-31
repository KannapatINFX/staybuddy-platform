import Constants from "expo-constants";
import type { GuestTheme } from "@staybuddy/ui";

export type CompiledTenant = {
  hotelId: string;
  appId: string;
  appInstallationKey: string;
  displayName: string;
  defaultLocale: "en" | "th" | "zh-CN" | "ru";
  supportedLocales: ("en" | "th" | "zh-CN" | "ru")[];
  bootstrapPublicKeyHex: string;
  theme: GuestTheme & { logoUrl: string; heroImageUrl?: string };
};

type AppExtra = { tenant?: CompiledTenant; apiUrl?: string };

export function compiledConfig(): { tenant: CompiledTenant; apiUrl: string; appVersion: string } {
  const extra = Constants.expoConfig?.extra as AppExtra | undefined;
  if (!extra?.tenant?.appInstallationKey) throw new Error("COMPILED_TENANT_MISSING");
  return {
    tenant: extra.tenant,
    apiUrl: extra.apiUrl ?? "http://localhost:4000",
    appVersion: Constants.expoConfig?.version ?? "0.0.0",
  };
}
