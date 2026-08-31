import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { PrincipalService } from "./principal.service.js";
import { PlatformService } from "./platform.service.js";

@Controller()
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly principals: PrincipalService,
  ) {}

  @Get("mobile/bootstrap")
  getBootstrap(@Headers("x-app-installation-key") appKey?: string) {
    return this.platform.getBootstrap(appKey ?? "");
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
