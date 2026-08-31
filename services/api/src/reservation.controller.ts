import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
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
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.reservations.preview(input);
  }

  @Post("reservation-imports/commit")
  async commit(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.reservations.commit(input, principal, idempotencyKey);
  }

  @Post("reservations/manual")
  async manual(
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.reservations.createManual(input, principal, idempotencyKey);
  }

  @Get("reservations")
  async list(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Headers("authorization") authorization?: string,
    @Headers("x-debug-hotel-id") hotelId?: string,
    @Headers("x-debug-hotel-role") role?: string,
  ) {
    const principal = await this.principals.hotel(authorization, hotelId, role);
    this.principals.requireRole(principal, ["HOTEL_OWNER", "HOTEL_ADMIN", "FRONT_DESK"]);
    return this.reservations.listUpcoming(principal, from, to);
  }
}
