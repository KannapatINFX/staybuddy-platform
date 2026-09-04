import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StoreListingSchema, TenantAppBuildConfigSchema } from "../packages/contracts/src/index";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function generateAppProfile(
  tenantSlug: string,
  profile: "development" | "preview" | "production",
  outputPath: string,
) {
  const configPath = path.join(root, "config", "tenants", tenantSlug, "app.json");
  const tenant = TenantAppBuildConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")) as unknown);
  if (tenant.slug !== tenantSlug) throw new Error("TENANT_SLUG_MISMATCH");
  if (profile === "production" && tenant.assets.status !== "APPROVED") {
    throw new Error(`PRODUCTION_ASSETS_NOT_APPROVED:${tenantSlug}`);
  }
  const storeListing = StoreListingSchema.parse(
    JSON.parse(await readFile(path.resolve(root, tenant.storeListingPath), "utf8")) as unknown,
  );
  const generated = {
    schemaVersion: 1,
    generatedFrom: path.relative(root, configPath),
    tenant: {
      hotelId: tenant.hotelId,
      appId: tenant.appId,
      slug: tenant.slug,
      appName: tenant.appName,
    },
    identity: {
      iosBundleIdentifier: tenant.iosBundleIdentifier,
      androidPackage: tenant.androidPackage,
      scheme: tenant.deepLinks.scheme,
      universalLinkOrigin: tenant.deepLinks.universalLinkOrigin,
      installLandingUrl: tenant.deepLinks.installLandingUrl,
    },
    assets: tenant.assets,
    storeListing,
    eas: {
      profile,
      environment: { STAYBUDDY_TENANT: tenant.slug, APP_FACTORY_PROFILE: profile },
      distribution: profile === "production" ? "store" : "internal",
    },
  } as const;
  const absoluteOutput = path.resolve(root, outputPath);
  await mkdir(path.dirname(absoluteOutput), { recursive: true });
  await writeFile(absoluteOutput, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
  return generated;
}

const [tenantSlug, profile = "preview", outputPath] = process.argv.slice(2);
if (tenantSlug && outputPath) {
  await generateAppProfile(tenantSlug, profile as "development" | "preview" | "production", outputPath);
}
