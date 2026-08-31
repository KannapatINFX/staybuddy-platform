import { createDatabasePool, runMigrations } from "./index.js";

const command = process.argv[2];
if (command !== "migrate") throw new Error(`Unknown command: ${command ?? "none"}`);

const pool = createDatabasePool();
try {
  const applied = await runMigrations(pool);
  process.stdout.write(`Applied ${applied.length} migration(s): ${applied.join(", ") || "none"}\n`);
} finally {
  await pool.end();
}
