import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { IdentityService } from "./identity.service.js";
import { PrincipalService } from "./principal.service.js";

@Controller()
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly principals: PrincipalService,
  ) {}

  @Post("admin/stays/:stayId/claims")
  async issueClaim(
    @Param("stayId") stayId: string,
    @Body() input: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.identity.issueStayClaim(stayId, input, principal);
  }

  @Post("admin/stays/:stayId/prearrival-invitations")
  async issueInvitation(
    @Param("stayId") stayId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.identity.issuePrearrivalInvitation(stayId, principal);
  }

  @Post("stay-claims/scan")
  scanClaim(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("x-installation-id") installationId?: string,
  ) {
    return this.identity.scanStayClaim(appKey ?? "", input, installationId);
  }

  @Post("prearrival-invitations/scan")
  scanInvitation(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("x-installation-id") installationId?: string,
  ) {
    return this.identity.scanPrearrivalInvitation(appKey ?? "", input, installationId);
  }

  @Post("auth/email/start")
  startOtp(@Body() input: unknown, @Headers("x-app-installation-key") appKey?: string) {
    return this.identity.startEmailOtp(appKey ?? "", input);
  }

  @Post("auth/email/verify")
  verifyOtp(@Body() input: unknown, @Headers("x-app-installation-key") appKey?: string) {
    return this.identity.verifyEmailOtp(appKey ?? "", input);
  }

  @Post("auth/oauth")
  verifyOauth(@Body() input: unknown, @Headers("x-app-installation-key") appKey?: string) {
    return this.identity.verifyOAuth(appKey ?? "", input);
  }

  @Post("consents")
  recordConsent(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.identity.recordConsent(appKey ?? "", authorization, input);
  }

  @Post("stay-claims/complete")
  completeClaim(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.identity.completeStayClaim(appKey ?? "", authorization, input);
  }

  @Post("prearrival-invitations/complete")
  completeInvitation(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.identity.completePrearrivalInvitation(appKey ?? "", authorization, input);
  }

  @Post("me/devices/push-permission")
  updatePushPermission(
    @Body() input: unknown,
    @Headers("x-app-installation-key") appKey?: string,
    @Headers("authorization") authorization?: string,
  ) {
    return this.identity.updatePushPermission(appKey ?? "", authorization, input);
  }
}
