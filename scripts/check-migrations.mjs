import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(repositoryRoot, "packages/db/migrations");
const migrationNames = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
const failures = [];
const destructivePattern = /\b(DROP\s+(TABLE|SCHEMA|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i;

if (migrationNames.length === 0) failures.push("no SQL migrations found");

for (const [index, name] of migrationNames.entries()) {
  const expectedPrefix = String(index + 1).padStart(4, "0");
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(name)) {
    failures.push(`${name}: expected NNNN_snake_case.sql naming`);
  }
  if (!name.startsWith(`${expectedPrefix}_`)) {
    failures.push(`${name}: expected sequential prefix ${expectedPrefix}`);
  }

  const sql = await readFile(path.join(migrationDirectory, name), "utf8");
  if (!sql.trim()) failures.push(`${name}: migration is empty`);
  if (destructivePattern.test(sql) && !sql.includes("-- staybuddy: allow-destructive-migration")) {
    failures.push(
      `${name}: destructive SQL requires an ADR and the explicit staybuddy allow-destructive-migration marker`,
    );
  }
}

if (failures.length) {
  process.stderr.write(`Migration policy failed:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Migration policy passed for ${migrationNames.length} forward migrations.\n`);
}
