import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredArtifacts = [
  "apps/mobile/dist",
  "apps/hotel-admin/.next",
  "apps/ops-admin/.next",
  "apps/merchant-portal/.next",
  "services/api/dist/main.js",
  "services/worker/dist/main.js",
  "packages/concierge/dist/index.js",
  "packages/contracts/dist/index.js",
  "packages/db/dist/index.js",
  "packages/domain/dist/index.js",
  "packages/localization/dist/index.js",
  "packages/observability/dist/index.js",
  "packages/pms-sdk/dist/index.js",
  "packages/ui/dist/index.js",
  "docs/contracts/openapi.json",
];
const missing = [];

for (const relativePath of requiredArtifacts) {
  await access(path.join(repositoryRoot, relativePath)).catch(() => missing.push(relativePath));
}

if (missing.length) {
  process.stderr.write(`Build artifact check failed; missing:\n- ${missing.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Build artifact check passed for ${requiredArtifacts.length} outputs.\n`);
}
