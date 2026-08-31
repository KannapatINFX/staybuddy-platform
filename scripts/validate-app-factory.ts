import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TenantConfig = {
  hotelId: string;
  appId: string;
  slug: string;
  appName: string;
  appInstallationKey: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  scheme: string;
  supportedLocales: string[];
  bootstrapPublicKeyHex: string;
  assetStatus: "PLACEHOLDER" | "APPROVED";
  theme: Record<string, string>;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tenantRoot = path.join(root, "config", "tenants");
const slugs = await readdir(tenantRoot);
const configs = await Promise.all(
  slugs.map(
    async (slug) =>
      JSON.parse(await readFile(path.join(tenantRoot, slug, "app.json"), "utf8")) as TenantConfig,
  ),
);

const requiredLocales = ["en", "th", "zh-CN", "ru"];
for (const config of configs) {
  if (config.slug !== path.basename(config.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.slug)) {
    throw new Error(`INVALID_TENANT_SLUG:${config.slug}`);
  }
  if (config.appInstallationKey.length < 16) throw new Error(`APP_KEY_TOO_SHORT:${config.slug}`);
  if (!/^com\.[a-z0-9.]+$/.test(config.iosBundleIdentifier)) throw new Error(`INVALID_IOS_ID:${config.slug}`);
  if (!/^com\.[a-z0-9.]+$/.test(config.androidPackage)) throw new Error(`INVALID_ANDROID_ID:${config.slug}`);
  if (JSON.stringify([...config.supportedLocales].sort()) !== JSON.stringify([...requiredLocales].sort())) {
    throw new Error(`MISSING_LAUNCH_LOCALE:${config.slug}`);
  }
  if (!/^[0-9a-f]{64}$/.test(config.bootstrapPublicKeyHex))
    throw new Error(`INVALID_BOOTSTRAP_KEY:${config.slug}`);
  if (Object.keys(config).some((key) => /secret|private|token/i.test(key)))
    throw new Error(`SECRET_FIELD_IN_PUBLIC_CONFIG:${config.slug}`);
  for (const [name, value] of Object.entries(config.theme)) {
    if (name.toLowerCase().includes("url") && !URL.canParse(value))
      throw new Error(`INVALID_ASSET_URL:${config.slug}:${name}`);
    if (!name.toLowerCase().includes("url") && !/^#[0-9A-F]{6}$/i.test(value)) {
      throw new Error(`INVALID_THEME_TOKEN:${config.slug}:${name}`);
    }
  }
  if (process.env.APP_FACTORY_PROFILE === "production" && config.assetStatus !== "APPROVED") {
    throw new Error(`PRODUCTION_ASSETS_NOT_APPROVED:${config.slug}`);
  }
}

for (const field of [
  "hotelId",
  "appId",
  "appInstallationKey",
  "iosBundleIdentifier",
  "androidPackage",
  "scheme",
] as const) {
  const values = configs.map((config) => config[field]);
  if (new Set(values).size !== values.length) throw new Error(`DUPLICATE_${field.toUpperCase()}`);
}

process.stdout.write(
  `${JSON.stringify({ tenants: configs.map(({ slug, appName, iosBundleIdentifier, androidPackage, assetStatus }) => ({ slug, appName, iosBundleIdentifier, androidPackage, assetStatus })), status: "VALID" }, null, 2)}\n`,
);
