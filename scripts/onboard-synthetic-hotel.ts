import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CreateHotelInputSchema } from "@staybuddy/contracts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2] ?? "cc-phuket-residence";
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_TENANT_SLUG");
const fixturePath = path.join(root, "config", "tenants", slug, "onboarding.json");
const payload = CreateHotelInputSchema.parse(JSON.parse(await readFile(fixturePath, "utf8")) as unknown);
const apiUrl = process.env.STAYBUDDY_API_URL ?? "http://localhost:4000";
const accessToken = process.env.STAYBUDDY_OPS_ACCESS_TOKEN;
if (!accessToken) throw new Error("STAYBUDDY_OPS_ACCESS_TOKEN_REQUIRED");

const response = await fetch(`${apiUrl}/v1/ops/hotels`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `synthetic-${slug}-${randomUUID()}`,
  },
  body: JSON.stringify(payload),
});
const result: unknown = await response.json();
if (!response.ok) throw new Error(`SYNTHETIC_ONBOARDING_FAILED:${response.status}:${JSON.stringify(result)}`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
