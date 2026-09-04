import { readFile, readdir } from "node:fs/promises";
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

for (const [file, pattern, description] of [
  [
    "packages/db/migrations/0006_white_label_app_factory.sql",
    /app_build_status_events/,
    "append-only build history is required",
  ],
  [
    "packages/db/migrations/0006_white_label_app_factory.sql",
    /app_build_jobs_one_active_lane/,
    "one active per-app platform lane is required",
  ],
  [
    "packages/db/migrations/0006_white_label_app_factory.sql",
    /STAYBUDDY_APP_OPS/,
    "least-privilege App Ops role is required",
  ],
  ["packages/domain/src/index.ts", /assertAppBuildTransition/, "build lifecycle must be deterministic"],
  [
    "services/api/src/platform.service.ts",
    /APP_BUILD_CONFIG_NOT_VALID/,
    "queue must reject unvalidated app config",
  ],
  [
    "services/api/src/platform.service.ts",
    /app\.build\.status_changed/,
    "build transitions must emit audit and outbox evidence",
  ],
  [
    "services/worker/src/processor.test.ts",
    /keeps one hotel build failure isolated/,
    "tenant-specific failure isolation must be tested",
  ],
  [
    "apps/mobile/app.config.ts",
    /associatedDomains[\s\S]*intentFilters/,
    "iOS and Android universal links are required",
  ],
  [
    "apps/mobile/src/navigation/deep-links.ts",
    /DEEP_LINK_APP_IDENTITY_MISMATCH/,
    "deep links must pin compiled app identity",
  ],
  [
    "apps/mobile/src/navigation/deep-links.test.ts",
    /DEEP_LINK_TENANT_OVERRIDE_PROHIBITED/,
    "tenant override rejection must be tested",
  ],
  [
    "apps/mobile/src/state/BootstrapContext.tsx",
    /If-None-Match[\s\S]*response\.status === 304/,
    "mobile cache must revalidate ETags",
  ],
  [
    "scripts/validate-app-factory.ts",
    /ASSET_HASH_MISMATCH[\s\S]*ASSET_DIMENSION_MISMATCH/,
    "asset hash and dimensions must be validated",
  ],
  [
    "scripts/validate-app-factory.ts",
    /PRODUCTION_ASSETS_NOT_APPROVED/,
    "synthetic assets must block production profiles",
  ],
  ["apps/ops-admin/app/app-factory/page.tsx", /SB-O-017/, "App Factory dashboard is required"],
  [
    "apps/ops-admin/app/app-factory/[hotelAppId]/page.tsx",
    /SB-O-018/,
    "build configuration screen is required",
  ],
  ["apps/ops-admin/app/app-builds/page.tsx", /SB-O-019/, "build queue screen is required"],
  ["apps/ops-admin/app/app-builds/[buildJobId]/page.tsx", /SB-O-020/, "build detail screen is required"],
  [
    "services/api/test/api.integration.test.ts",
    /status: "FAILED"[\s\S]*status: "BUILT"/,
    "independent failed and built lanes must be integration tested",
  ],
])
  await expect(file, pattern, description);

const tenantDirectories = (await readdir(path.join(root, "config", "tenants"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const configs = await Promise.all(
  tenantDirectories.map(async (slug) =>
    JSON.parse(await readFile(path.join(root, "config", "tenants", slug, "app.json"), "utf8")),
  ),
);
controls += 4;
if (configs.length < 2) failures.push("config/tenants: two synthetic app identities are required");
for (const field of ["iosBundleIdentifier", "androidPackage"]) {
  if (new Set(configs.map((config) => config[field])).size !== configs.length)
    failures.push(`config/tenants: duplicate ${field}`);
}
if (new Set(configs.map((config) => config.deepLinks.scheme)).size !== configs.length)
  failures.push("config/tenants: duplicate deep-link scheme");

if (failures.length) {
  process.stderr.write(`Sprint 7 app factory check failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Sprint 7 app factory check passed for ${controls} controls.\n`);
}
