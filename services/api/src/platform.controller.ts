import { createHash } from "node:crypto";
import { Body, Controller, Get, Headers, Param, Patch, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { PrincipalService } from "./principal.service.js";
import { PlatformService } from "./platform.service.js";

@Controller()
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly principals: PrincipalService,
  ) {}

  @Get("mobile/bootstrap")
  async getBootstrap(
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("x-app-version") appVersion?: string,
    @Headers("if-none-match") ifNoneMatch?: string,
    @Res({ passthrough: true }) response?: FastifyReply,
  ) {
    const signed = await this.platform.getBootstrap(appKey ?? "", appVersion);
    const etag = `"${createHash("sha256").update(JSON.stringify(signed)).digest("base64url")}"`;
    response?.header("Cache-Control", "private, max-age=300, stale-if-error=86400");
    response?.header("Vary", "X-App-Installation-Key, X-App-Version");
    response?.header("ETag", etag);
    if (ifNoneMatch === etag) {
      response?.code(304);
      return;
    }
    return signed;
  }

  @Get("ops/hotels/:hotelId")
  async getHotel(
    @Param("hotelId") hotelId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.hotels.read");
    return this.platform.getHotel(hotelId, principal);
  }

  @Patch("ops/hotels/:hotelId/config")
  async publishHotelConfig(
    @Param("hotelId") hotelId: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.hotels.configure");
    return this.platform.publishHotelConfig(hotelId, input, principal, idempotencyKey);
  }

  @Get("ops/hotels")
  async listHotels(
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.hotels.read");
    return this.platform.listHotels(principal);
  }

  @Post("ops/hotels")
  async createHotel(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.hotels.create");
    return this.platform.createHotel(input, principal, idempotencyKey);
  }

  @Post("ops/app-builds")
  async createBuildJob(
    @Body() input: Parameters<PlatformService["createBuildJob"]>[0],
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.app-builds.create");
    return this.platform.createBuildJob(input, principal, idempotencyKey);
  }
}
