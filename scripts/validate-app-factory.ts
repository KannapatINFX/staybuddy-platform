import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  StoreListingSchema,
  TenantAppBuildConfigSchema,
  type TenantAppBuildConfig,
} from "../packages/contracts/src/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tenantRoot = path.join(root, "config", "tenants");
const requiredLocales = ["en", "th", "zh-CN", "ru"];

const slugs = (await readdir(tenantRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const configs = await Promise.all(
  slugs.map(async (slug) => {
    const raw: unknown = JSON.parse(await readFile(path.join(tenantRoot, slug, "app.json"), "utf8"));
    return TenantAppBuildConfigSchema.parse(raw);
  }),
);

for (const config of configs) await validateTenant(config);
for (const field of [
  "hotelId",
  "appId",
  "appInstallationKey",
  "iosBundleIdentifier",
  "androidPackage",
] as const) {
  const values = configs.map((config) => config[field]);
  if (new Set(values).size !== values.length) throw new Error(`DUPLICATE_${field.toUpperCase()}`);
}
for (const selector of [
  (config: TenantAppBuildConfig) => config.deepLinks.scheme,
  (config: TenantAppBuildConfig) => new URL(config.deepLinks.universalLinkOrigin).host,
  (config: TenantAppBuildConfig) => config.deepLinks.installLandingUrl,
]) {
  const values = configs.map(selector);
  if (new Set(values).size !== values.length) throw new Error("DUPLICATE_DEEP_LINK_IDENTITY");
}

process.stdout.write(
  `${JSON.stringify(
    {
      tenants: configs.map((config) => ({
        slug: config.slug,
        appName: config.appName,
        iosBundleIdentifier: config.iosBundleIdentifier,
        androidPackage: config.androidPackage,
        scheme: config.deepLinks.scheme,
        installLandingUrl: config.deepLinks.installLandingUrl,
        assetStatus: config.assets.status,
      })),
      status: "VALID",
    },
    null,
    2,
  )}\n`,
);

async function validateTenant(config: TenantAppBuildConfig) {
  if (config.slug !== path.basename(config.slug)) throw new Error(`INVALID_TENANT_SLUG:${config.slug}`);
  if (JSON.stringify([...config.supportedLocales].sort()) !== JSON.stringify([...requiredLocales].sort())) {
    throw new Error(`MISSING_LAUNCH_LOCALE:${config.slug}`);
  }
  if (Object.keys(config).some((key) => /secret|private|token/i.test(key))) {
    throw new Error(`SECRET_FIELD_IN_PUBLIC_CONFIG:${config.slug}`);
  }
  if (config.deepLinks.allowedRoutes.some((route) => route.includes("hotel"))) {
    throw new Error(`TENANT_SELECTOR_ROUTE_PROHIBITED:${config.slug}`);
  }
  const listing = StoreListingSchema.parse(
    JSON.parse(await readFile(resolveInsideRoot(config.storeListingPath), "utf8")) as unknown,
  );
  const listingLocales = listing.locales.map(({ locale }) => locale).sort();
  if (JSON.stringify(listingLocales) !== JSON.stringify([...requiredLocales].sort())) {
    throw new Error(`MISSING_STORE_LOCALE:${config.slug}`);
  }
  for (const [kind, asset] of Object.entries(config.assets).filter(([key]) => key !== "status") as Array<
    ["icon" | "adaptiveIcon" | "splash", TenantAppBuildConfig["assets"]["icon"]]
  >) {
    const bytes = await readFile(resolveInsideRoot(asset.path));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== asset.sha256) throw new Error(`ASSET_HASH_MISMATCH:${config.slug}:${kind}`);
    const dimensions = readPngDimensions(bytes);
    if (dimensions.width !== asset.width || dimensions.height !== asset.height) {
      throw new Error(`ASSET_DIMENSION_MISMATCH:${config.slug}:${kind}`);
    }
    if ((kind === "icon" || kind === "adaptiveIcon") && (asset.width !== 1024 || asset.height !== 1024)) {
      throw new Error(`INVALID_ICON_DIMENSIONS:${config.slug}:${kind}`);
    }
    if (kind === "splash" && (asset.width < 1200 || asset.height < 2400)) {
      throw new Error(`INVALID_SPLASH_DIMENSIONS:${config.slug}`);
    }
  }
  if (process.env.APP_FACTORY_PROFILE === "production") {
    if (config.assets.status !== "APPROVED") throw new Error(`PRODUCTION_ASSETS_NOT_APPROVED:${config.slug}`);
    for (const url of [
      config.deepLinks.universalLinkOrigin,
      config.deepLinks.installLandingUrl,
      listing.privacyUrl,
      listing.supportUrl,
    ]) {
      if (new URL(url).hostname.endsWith(".invalid"))
        throw new Error(`PRODUCTION_URL_NOT_APPROVED:${config.slug}`);
    }
  }
}

function resolveInsideRoot(relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`PATH_OUTSIDE_REPOSITORY:${relativePath}`);
  return resolved;
}

function readPngDimensions(bytes: Buffer) {
  if (
    bytes.subarray(1, 4).toString("ascii") !== "PNG" ||
    bytes.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error("ASSET_NOT_PNG");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
