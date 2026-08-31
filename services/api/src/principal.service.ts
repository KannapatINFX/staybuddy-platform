import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { DatabasePool } from "@staybuddy/db";
import { withPlatformTransaction, withTenantTransaction } from "@staybuddy/db";
import {
  canHotel,
  canPlatform,
  isHotelRole,
  isPlatformRole,
  type HotelPermission,
  type HotelRole,
  type PlatformPermission,
  type PlatformRole,
} from "@staybuddy/domain";
import { jwtVerify } from "jose";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";

export type PlatformPrincipal = { type: "platform"; actorId: string; role: PlatformRole };
export type HotelPrincipal = {
  type: "hotel";
  actorId: string;
  hotelId: string;
  role: HotelRole;
  departmentId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PrincipalService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  async platform(
    authorization?: string,
    debugRole?: string,
    debugActorId?: string,
  ): Promise<PlatformPrincipal> {
    const claims = await this.verify(authorization);
    let actorId: string | undefined;
    let role: string | undefined;
    if (
      claims?.actor_type === "platform" &&
      typeof claims.sub === "string" &&
      typeof claims.platform_role === "string"
    ) {
      actorId = claims.sub;
      role = claims.platform_role;
    } else if (this.debugAuthEnabled() && debugRole && debugActorId) {
      actorId = debugActorId;
      role = debugRole;
    }
    if (!actorId || !uuidPattern.test(actorId) || !role || !isPlatformRole(role)) {
      throw new AppError("UNAUTHENTICATED", 401);
    }
    const active = await withPlatformTransaction(
      this.pool,
      { actorId, platformRole: "STAYBUDDY_AUTHENTICATOR", traceId: randomUUID() },
      (client) =>
        client.query(
          `SELECT 1
           FROM platform_identities identity
           JOIN platform_role_grants grant_row ON grant_row.platform_identity_id = identity.id
           WHERE identity.id = $1 AND identity.status = 'ACTIVE'
             AND grant_row.role = $2 AND grant_row.status = 'ACTIVE'`,
          [actorId, role],
        ),
    );
    if (!active.rowCount) throw new AppError("FORBIDDEN", 403);
    return { type: "platform", actorId, role };
  }

  async hotel(
    authorization?: string,
    debugHotelId?: string,
    debugRole?: string,
    debugActorId?: string,
  ): Promise<HotelPrincipal> {
    const claims = await this.verify(authorization);
    let actorId: string | undefined;
    let hotelId: string | undefined;
    let role: string | undefined;
    let claimedDepartmentId: string | undefined;
    if (
      claims?.actor_type === "hotel" &&
      typeof claims.sub === "string" &&
      typeof claims.hotel_id === "string" &&
      typeof claims.hotel_role === "string"
    ) {
      actorId = claims.sub;
      hotelId = claims.hotel_id;
      role = claims.hotel_role;
      claimedDepartmentId = typeof claims.department_id === "string" ? claims.department_id : undefined;
    } else if (this.debugAuthEnabled() && debugHotelId && debugRole && debugActorId) {
      actorId = debugActorId;
      hotelId = debugHotelId;
      role = debugRole;
    }
    if (
      !actorId ||
      !uuidPattern.test(actorId) ||
      !hotelId ||
      !uuidPattern.test(hotelId) ||
      !role ||
      !isHotelRole(role)
    ) {
      throw new AppError("UNAUTHENTICATED", 401);
    }
    const membership = await withTenantTransaction(
      this.pool,
      { hotelId, actorId, traceId: randomUUID() },
      (client) =>
        client.query<{ department_id: string | null }>(
          `SELECT department_id
           FROM hotel_memberships
           WHERE hotel_id = $1 AND staff_identity_id = $2 AND role = $3 AND status = 'ACTIVE'
             AND app.staff_identity_is_active(staff_identity_id)`,
          [hotelId, actorId, role],
        ),
    );
    const row = membership.rows[0];
    if (!row) throw new AppError("FORBIDDEN", 403);
    const departmentId = row.department_id ?? undefined;
    if (claimedDepartmentId && claimedDepartmentId !== departmentId) {
      throw new AppError("FORBIDDEN", 403);
    }
    return { type: "hotel", actorId, hotelId, role, ...(departmentId ? { departmentId } : {}) };
  }

  requirePlatformPermission(principal: PlatformPrincipal, permission: PlatformPermission): void {
    if (!canPlatform(principal.role, permission)) throw new AppError("FORBIDDEN", 403);
  }

  requireHotelPermission(
    principal: HotelPrincipal,
    permission: HotelPermission,
    resource?: { departmentId?: string },
  ): void {
    if (!canHotel(principal, permission, resource)) throw new AppError("FORBIDDEN", 403);
  }

  private debugAuthEnabled(): boolean {
    return process.env.NODE_ENV === "test" && process.env.ALLOW_DEBUG_AUTH === "true";
  }

  private async verify(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) return undefined;
    const secret = process.env.STAFF_JWT_SECRET;
    if (!secret) throw new AppError("UNAUTHENTICATED", 401);
    try {
      const result = await jwtVerify(
        new TextEncoder().encode(authorization.slice(7)),
        new TextEncoder().encode(secret),
        { issuer: "staybuddy-platform", audience: "staybuddy-admin" },
      );
      return result.payload;
    } catch {
      throw new AppError("UNAUTHENTICATED", 401);
    }
  }
}
