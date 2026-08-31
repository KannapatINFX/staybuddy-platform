import { configureRuntimeDatabaseRole, createDatabasePool, runMigrations } from "./index.js";

const command = process.argv[2];
if (command !== "migrate") throw new Error(`Unknown command: ${command ?? "none"}`);

const pool = createDatabasePool();
try {
  const applied = await runMigrations(pool);
  const runtimePassword = process.env.DATABASE_RUNTIME_PASSWORD;
  if (runtimePassword) {
    await configureRuntimeDatabaseRole(pool, runtimePassword);
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_RUNTIME_PASSWORD is required in production");
  }
  process.stdout.write(`Applied ${applied.length} migration(s): ${applied.join(", ") || "none"}\n`);
} finally {
  await pool.end();
}
