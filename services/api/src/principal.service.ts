import { Injectable } from "@nestjs/common";
import { jwtVerify } from "jose";
import { AppError } from "./errors.js";

export type PlatformPrincipal = { type: "platform"; actorId: string; role: string };
export type HotelPrincipal = {
  type: "hotel";
  actorId: string;
  hotelId: string;
  role: string;
  departmentId?: string;
};

@Injectable()
export class PrincipalService {
  async platform(authorization?: string, debugRole?: string): Promise<PlatformPrincipal> {
    const claims = await this.verify(authorization);
    if (
      claims?.actor_type === "platform" &&
      typeof claims.sub === "string" &&
      typeof claims.platform_role === "string"
    ) {
      return { type: "platform", actorId: claims.sub, role: claims.platform_role };
    }
    if (process.env.NODE_ENV !== "production" && debugRole) {
      return { type: "platform", actorId: "local-platform-user", role: debugRole };
    }
    throw new AppError("UNAUTHENTICATED", 401);
  }

  async hotel(authorization?: string, debugHotelId?: string, debugRole?: string): Promise<HotelPrincipal> {
    const claims = await this.verify(authorization);
    if (
      claims?.actor_type === "hotel" &&
      typeof claims.sub === "string" &&
      typeof claims.hotel_id === "string" &&
      typeof claims.hotel_role === "string"
    ) {
      return {
        type: "hotel",
        actorId: claims.sub,
        hotelId: claims.hotel_id,
        role: claims.hotel_role,
        ...(typeof claims.department_id === "string" ? { departmentId: claims.department_id } : {}),
      };
    }
    if (process.env.NODE_ENV !== "production" && debugHotelId && debugRole) {
      return { type: "hotel", actorId: "local-hotel-user", hotelId: debugHotelId, role: debugRole };
    }
    throw new AppError("UNAUTHENTICATED", 401);
  }

  requireRole(principal: PlatformPrincipal | HotelPrincipal, allowed: readonly string[]): void {
    if (!allowed.includes(principal.role)) throw new AppError("FORBIDDEN", 403);
  }

  private async verify(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) return undefined;
    const secret = process.env.STAFF_JWT_SECRET;
    if (!secret) throw new AppError("UNAUTHENTICATED", 401);
    try {
      const result = await jwtVerify(
        new TextEncoder().encode(authorization.slice(7)),
        new TextEncoder().encode(secret),
        {
          issuer: "staybuddy-platform",
          audience: "staybuddy-admin",
        },
      );
      return result.payload;
    } catch {
      throw new AppError("UNAUTHENTICATED", 401);
    }
  }
}
