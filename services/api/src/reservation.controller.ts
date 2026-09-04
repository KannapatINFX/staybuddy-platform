import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { PrincipalService } from "./principal.service.js";
import { ReservationService } from "./reservation.service.js";

@Controller("admin")
export class ReservationController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly principals: PrincipalService,
  ) {}

  @Post("reservation-imports/preview")
  async preview(
    @Body() input: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.preview(input, principal);
  }

  @Get("reservation-mappings")
  async mappings(
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.listMappings(principal);
  }

  @Post("reservation-mappings")
  async saveMapping(
    @Body() input: unknown,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.write");
    return this.reservations.saveMapping(input, principal);
  }

  @Get("reservation-imports")
  async imports(
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.listImports(principal);
  }

  @Get("reservation-imports/health")
  async health(
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.hotelHealth(principal);
  }

  @Get("reservation-imports/:batchId")
  async importDetail(
    @Param("batchId") batchId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.getImport(batchId, principal);
  }

  @Post("reservation-imports/:batchId/retry")
  async retry(
    @Param("batchId") batchId: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.write");
    return this.reservations.retry(batchId, input, principal, idempotencyKey);
  }

  @Post("reservation-imports/commit")
  async commit(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.write");
    return this.reservations.commit(input, principal, idempotencyKey);
  }

  @Post("reservations/manual")
  async manual(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.write");
    return this.reservations.createManual(input, principal, idempotencyKey);
  }

  @Get("reservations")
  async list(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.listUpcoming(principal, from, to);
  }

  @Get("reservations/:reservationId")
  async detail(
    @Param("reservationId") reservationId: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
    @Headers("x-debug-actor-id") actorId?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role, actorId);
    this.principals.requireHotelPermission(principal, "hotel.reservations.read");
    return this.reservations.getReservation(reservationId, principal);
  }
}

@Controller("ops/integrations")
export class ReservationOpsController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly principals: PrincipalService,
  ) {}

  @Get("health")
  async health(
    @Headers("authorization") authorization?: string,
    @Headers("x-platform-role") debugRole?: string,
    @Headers("x-debug-actor-id") debugActorId?: string,
  ) {
    const principal = await this.principals.platform(authorization, debugRole, debugActorId);
    this.principals.requirePlatformPermission(principal, "platform.hotels.read");
    return this.reservations.platformHealth(principal);
  }
}
