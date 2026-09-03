import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let controls = 0;

async function expect(relativePath, pattern, description) {
  const contents = await readFile(path.join(root, relativePath), "utf8");
  controls += 1;
  if (!pattern.test(contents)) failures.push(`${relativePath}: ${description}`);
}

const migration = "packages/db/migrations/0005_hotel_onboarding_config.sql";
const service = "services/api/src/platform.service.ts";
const integration = "services/api/test/api.integration.test.ts";

for (const [file, pattern, description] of [
  [
    migration,
    /CREATE TABLE IF NOT EXISTS hotel_onboarding_profiles/,
    "encrypted onboarding profile is required",
  ],
  [migration, /CREATE TABLE IF NOT EXISTS hotel_onboarding_steps/, "durable onboarding progress is required"],
  [
    migration,
    /CREATE TABLE IF NOT EXISTS hotel_service_categories/,
    "initial service configuration is required",
  ],
  [
    migration,
    /CREATE TABLE IF NOT EXISTS hotel_public_config_versions/,
    "versioned public config is required",
  ],
  [migration, /hotel_public_config_versions_immutable/, "published config must be immutable"],
  [migration, /tenant_resolver_read_public_config/, "bootstrap resolver must have narrow read access"],
  [service, /CreateHotelInputSchema\.parse/, "hotel creation must use the canonical contract"],
  [service, /encryptPii\(values\.primaryContact\.name\)/, "primary contact must be encrypted"],
  [service, /executePlatformIdempotent[\s\S]*hotel\.config\.publish/, "config publishing must be idempotent"],
  [service, /hotel\.config\.updated/, "config update audit and event are required"],
  [service, /configVersion: row\.config_version/, "bootstrap must expose a config version"],
  [
    "services/api/src/http-exception.filter.ts",
    /exception instanceof ZodError/,
    "invalid onboarding contracts must return a safe client error",
  ],
  [
    "services/api/src/platform.controller.ts",
    /Cache-Control[\s\S]*ETag/,
    "bootstrap cache headers are required",
  ],
  [
    "apps/mobile/src/state/BootstrapContext.tsx",
    /BOOTSTRAP_APP_IDENTITY_MISMATCH/,
    "mobile must pin bootstrap tenant identity",
  ],
  [integration, /IDEMPOTENCY_KEY_REUSED/, "hotel onboarding replay mismatch must be tested"],
  [integration, /versionPolicy: "UPDATE_REQUIRED"/, "minimum-version policy must be tested"],
  [integration, /statusCode\)\.toBe\(304\)/, "bootstrap cache revalidation must be tested"],
  [
    integration,
    /not\.toContain\(hotelA\.appInstallationKey\)/,
    "bootstrap secret-leak regression must be tested",
  ],
  [
    "apps/ops-admin/app/hotels/new/page.tsx",
    /Create complete hotel tenant/,
    "Ops create-hotel screen is required",
  ],
  [
    "apps/ops-admin/app/hotels/[hotelId]/page.tsx",
    /Onboarding progress/,
    "Ops onboarding progress screen is required",
  ],
]) {
  await expect(file, pattern, description);
}

const fixturePath = "config/tenants/cc-phuket-residence/onboarding.json";
const fixture = JSON.parse(await readFile(path.join(root, fixturePath), "utf8"));
controls += 1;
for (const key of [
  "location",
  "primaryContact",
  "app",
  "brand",
  "departments",
  "serviceCategories",
  "features",
  "commercial",
]) {
  if (!(key in fixture)) failures.push(`${fixturePath}: missing ${key}`);
}
if (Object.keys(fixture).some((key) => /secret|private|token|installationKey/i.test(key))) {
  failures.push(`${fixturePath}: public onboarding fixture contains a secret-like field`);
}

if (failures.length) {
  process.stderr.write(`Sprint 6 onboarding check failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Sprint 6 onboarding check passed for ${controls} controls.\n`);
}
