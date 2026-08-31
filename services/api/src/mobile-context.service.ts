import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { DatabasePool } from "@staybuddy/db";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";

export type MobileContext = { hotelId: string; hotelAppId: string };

@Injectable()
export class MobileContextService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async resolve(appInstallationKey?: string): Promise<MobileContext> {
    if (!appInstallationKey) throw new AppError("TENANT_NOT_RESOLVED", 401);
    const hash = createHash("sha256").update(appInstallationKey).digest("hex");
    const result = await this.pool.query<{ hotel_id: string; id: string }>(
      `SELECT hotel_id, id FROM hotel_apps
       WHERE app_installation_key_hash = $1 AND status <> 'PAUSED'`,
      [hash],
    );
    const app = result.rows[0];
    if (!app) throw new AppError("TENANT_NOT_RESOLVED", 401);
    return { hotelId: app.hotel_id, hotelAppId: app.id };
  }
}
