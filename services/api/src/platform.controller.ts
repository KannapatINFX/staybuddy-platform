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
  ) {
    const principal = await this.principals.platform(authorization, debugRole);
    this.principals.requireRole(principal, ["STAYBUDDY_SUPER_ADMIN", "STAYBUDDY_SUPPORT"]);
    return this.platform.listHotels();
  }

  @Post("ops/hotels")
  async createHotel(
    @Body() input: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole);
    this.principals.requireRole(principal, ["STAYBUDDY_SUPER_ADMIN"]);
    return this.platform.createHotel(input, principal.actorId);
  }

  @Post("ops/app-builds")
  async createBuildJob(
    @Body() input: Parameters<PlatformService["createBuildJob"]>[0],
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole);
    this.principals.requireRole(principal, ["STAYBUDDY_SUPER_ADMIN"]);
    return this.platform.createBuildJob(input, principal.actorId);
  }
}
