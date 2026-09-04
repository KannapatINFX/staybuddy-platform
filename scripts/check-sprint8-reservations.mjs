import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
let controls = 0;
async function expect(file, pattern, message) {
  controls += 1;
  const contents = await readFile(path.join(root, file), "utf8");
  if (!pattern.test(contents)) failures.push(`${file}: ${message}`);
}

for (const [file, pattern, message] of [
  [
    "packages/db/migrations/0007_reservation_import_control_plane.sql",
    /reservation_import_previews[\s\S]*encrypted_source/,
    "server-owned encrypted preview staging is required",
  ],
  [
    "services/api/src/reservation.service.ts",
    /PREVIEW_CONSUMED[\s\S]*PREVIEW_EXPIRED/,
    "preview expiry and single-consume controls are required",
  ],
  [
    "services/api/src/reservation.service.ts",
    /UNCHANGED[\s\S]*CONFLICTED/,
    "deterministic duplicate and conflict outcomes are required",
  ],
  [
    "services/api/src/reservation.service.ts",
    /sourceSystem: "MANUAL"/,
    "manual provenance must be server-owned",
  ],
  [
    "services/api/src/reservation.controller.ts",
    /reservation-imports\/:batchId\/retry/,
    "retry endpoint is required",
  ],
  ["services/api/src/reservation.controller.ts", /ops\/integrations/, "Ops health endpoint is required"],
  [
    "services/api/test/api.integration.test.ts",
    /reservation-duplicate-[\s\S]*unchanged: 2/,
    "duplicate import behavior must be integration tested",
  ],
  [
    "services/api/test/api.integration.test.ts",
    /reservation-stale-[\s\S]*conflicted: 2/,
    "stale conflict behavior must be integration tested",
  ],
  ["apps/hotel-admin/app/arrivals/page.tsx", /SB-H-003/, "hotel arrivals screen is required"],
  ["apps/hotel-admin/app/integrations/import/page.tsx", /SB-H-078/, "hotel CSV import screen is required"],
  ["apps/hotel-admin/app/integrations/mapping/page.tsx", /SB-H-079/, "mapping wizard is required"],
  ["apps/hotel-admin/app/integrations/history/page.tsx", /SB-H-080/, "import history screen is required"],
  ["apps/ops-admin/app/integrations/page.tsx", /SB-O-036/, "Ops integration dashboard is required"],
  ["apps/ops-admin/app/integrations/[hotelId]/monitor/page.tsx", /SB-O-040/, "Ops sync monitor is required"],
  ["apps/ops-admin/app/integrations/errors/[batchId]/page.tsx", /SB-O-041/, "Ops error detail is required"],
  [
    "docs/DECISION_LOG.md",
    /ADR-0010-reservation-ingestion-trust-conflict-and-retry/,
    "ingestion trust and conflict ADR index is required",
  ],
])
  await expect(file, pattern, message);

if (failures.length) {
  process.stderr.write(`Sprint 8 reservation check failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Sprint 8 reservation check passed for ${controls} controls.\n`);
