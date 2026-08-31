import { Controller, Get, Inject } from "@nestjs/common";
import type { DatabasePool } from "@staybuddy/db";
import { DATABASE_POOL } from "./database.module.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  @Get()
  async health() {
    const startedAt = performance.now();
    await this.pool.query("SELECT 1");
    return {
      status: "ok",
      service: "staybuddy-api",
      database: "reachable",
      latencyMs: Math.round(performance.now() - startedAt),
      timestamp: new Date().toISOString(),
    };
  }
}
