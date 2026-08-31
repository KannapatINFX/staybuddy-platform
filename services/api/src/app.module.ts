import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module.js";
import { EmailDeliveryService } from "./email-delivery.service.js";
import { HealthController } from "./health.controller.js";
import { IdentityController } from "./identity.controller.js";
import { IdentityService } from "./identity.service.js";
import { MobileContextService } from "./mobile-context.service.js";
import { OAuthService } from "./oauth.service.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";
import { PrincipalService } from "./principal.service.js";
import { ReservationController } from "./reservation.controller.js";
import { ReservationService } from "./reservation.service.js";
import { SecurityService } from "./security.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [HealthController, PlatformController, ReservationController, IdentityController],
  providers: [
    EmailDeliveryService,
    IdentityService,
    MobileContextService,
    OAuthService,
    PlatformService,
    PrincipalService,
    ReservationService,
    SecurityService,
  ],
})
export class AppModule {}
