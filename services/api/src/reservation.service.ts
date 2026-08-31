import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CanonicalReservationSchema,
  ImportMappingSchema,
  ImportPreviewSchema,
  type CanonicalReservation,
} from "@staybuddy/contracts";
import {
  appendAuditAndOutbox,
  executeIdempotent,
  type DatabaseClient,
  type DatabasePool,
  withTenantTransaction,
} from "@staybuddy/db";
import { previewCsv } from "@staybuddy/pms-sdk";
import { z } from "zod";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";
import type { HotelPrincipal } from "./principal.service.js";
import { SecurityService } from "./security.service.js";

const PreviewInputSchema = z
  .object({ csv: z.string().min(1).max(10_000_000), mapping: ImportMappingSchema })
  .strict();
const CommitInputSchema = z
  .object({
    preview: ImportPreviewSchema,
    mapping: ImportMappingSchema,
    mappingName: z.string().min(1).max(120),
  })
  .strict();

@Injectable()
export class ReservationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    private readonly security: SecurityService,
  ) {}

  preview(input: unknown) {
    const values = PreviewInputSchema.parse(input);
    return previewCsv(values.csv, values.mapping);
  }

  async commit(input: unknown, principal: HotelPrincipal, idempotencyKey?: string) {
    if (!idempotencyKey) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    const values = CommitInputSchema.parse(input);
    return withTenantTransaction(
      this.pool,
      {
        hotelId: principal.hotelId,
        actorId: principal.actorId,
        traceId: randomUUID(),
        ...(process.env.TENANT_DATABASE_ROLE ? { databaseRole: process.env.TENANT_DATABASE_ROLE } : {}),
      },
      (client) =>
        executeIdempotent(client, {
          hotelId: principal.hotelId,
          key: idempotencyKey,
          request: values,
          expiresAt: new Date(Date.now() + 86_400_000),
          action: async () => ({
            status: 201,
            body: await this.persistBatch(client, values, principal, idempotencyKey),
          }),
        }),
    );
  }

  async createManual(input: unknown, principal: HotelPrincipal, idempotencyKey?: string) {
    const reservation = CanonicalReservationSchema.parse(input);
    if (!idempotencyKey) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    const preview = {
      batchId: randomUUID(),
      totalRows: 1,
      validRows: 1,
      rejectedRows: [],
      reservations: [reservation],
    };
    return this.commit(
      {
        preview,
        mapping: {
          sourceSystem: reservation.sourceSystem,
          columns: {
            externalReservationId: "manual",
            status: "manual",
            bookingSource: "manual",
            confirmationCode: "manual",
            guestName: "manual",
            checkInAt: "manual",
            checkOutAt: "manual",
          },
          defaults: { timezone: reservation.timezone },
        },
        mappingName: "Manual entry",
      },
      principal,
      idempotencyKey,
    );
  }

  async listUpcoming(principal: HotelPrincipal, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 86_400_000);
    if (Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()))
      throw new AppError("INVALID_REQUEST", 400);
    return withTenantTransaction(
      this.pool,
      {
        hotelId: principal.hotelId,
        actorId: principal.actorId,
        traceId: randomUUID(),
        ...(process.env.TENANT_DATABASE_ROLE ? { databaseRole: process.env.TENANT_DATABASE_ROLE } : {}),
      },
      async (client) => {
        const result = await client.query<{
          id: string;
          external_reservation_id: string;
          status: string;
          booking_source: string;
          confirmation_code: string;
          primary_guest_name: string;
          nationality: string | null;
          preferred_locale: string | null;
          check_in_at: Date;
          check_out_at: Date;
          stay_id: string;
          lifecycle: string;
          room_type: string | null;
          room_number: string | null;
        }>(
          `SELECT r.id, r.external_reservation_id, r.status, r.booking_source, r.confirmation_code,
                  r.primary_guest_name, r.nationality, r.preferred_locale, r.check_in_at, r.check_out_at,
                  s.id AS stay_id, s.lifecycle, rr.room_type, rr.room_number
           FROM reservations r
           JOIN stays s ON s.reservation_id = r.id
           LEFT JOIN reservation_rooms rr ON rr.reservation_id = r.id
           WHERE r.hotel_id = $1 AND r.check_in_at >= $2 AND r.check_in_at < $3
           ORDER BY r.check_in_at`,
          [principal.hotelId, fromDate, toDate],
        );
        return result.rows.map((row) => ({
          id: row.id,
          externalReservationId: row.external_reservation_id,
          status: row.status,
          bookingSource: row.booking_source,
          confirmationCode: row.confirmation_code,
          primaryGuestName: row.primary_guest_name,
          nationality: row.nationality,
          preferredLocale: row.preferred_locale,
          checkInAt: row.check_in_at.toISOString(),
          checkOutAt: row.check_out_at.toISOString(),
          stayId: row.stay_id,
          lifecycle: row.lifecycle,
          roomType: row.room_type,
          roomNumber: row.room_number,
        }));
      },
    );
  }

  private async persistBatch(
    client: DatabaseClient,
    values: z.infer<typeof CommitInputSchema>,
    principal: HotelPrincipal,
    idempotencyKey: string,
  ) {
    const mapping = await client.query<{ id: string }>(
      `INSERT INTO reservation_mapping_profiles
        (hotel_id, name, source_system, version, mapping, created_by)
       VALUES ($1,$2,$3,COALESCE((SELECT max(version)+1 FROM reservation_mapping_profiles WHERE hotel_id=$1 AND name=$2),1),$4,$5)
       RETURNING id`,
      [
        principal.hotelId,
        values.mappingName,
        values.mapping.sourceSystem,
        JSON.stringify(values.mapping),
        principal.actorId,
      ],
    );
    const batch = await client.query<{ id: string }>(
      `INSERT INTO reservation_import_batches
        (id, hotel_id, source_system, mapping_profile_id, status, total_rows, accepted_rows, rejected_rows, requested_by)
       VALUES ($1,$2,$3,$4,'PROCESSING',$5,0,$6,$7) RETURNING id`,
      [
        values.preview.batchId,
        principal.hotelId,
        values.mapping.sourceSystem,
        mapping.rows[0]!.id,
        values.preview.totalRows,
        values.preview.rejectedRows.length,
        principal.actorId,
      ],
    );
    let accepted = 0;
    let updated = 0;
    for (const reservation of values.preview.reservations) {
      const result = await this.upsertReservation(client, principal.hotelId, batch.rows[0]!.id, reservation);
      accepted += result.created ? 1 : 0;
      updated += result.created ? 0 : 1;
      await appendAuditAndOutbox(client, {
        hotelId: principal.hotelId,
        actor: { type: "HOTEL_STAFF", id: principal.actorId, role: principal.role },
        action: result.created ? "reservation.imported" : "reservation.updated",
        resource: { type: "reservation", id: result.reservationId },
        event: {
          type: result.created ? "reservation.imported" : "reservation.updated",
          aggregateType: "reservation",
          aggregateId: result.reservationId,
          payload: {
            sourceSystem: reservation.sourceSystem,
            externalReservationId: reservation.externalReservationId,
          },
        },
        traceId: randomUUID(),
        correlationId: values.preview.batchId,
        idempotencyKey,
      });
    }
    for (const rejection of values.preview.rejectedRows) {
      await client.query(
        `INSERT INTO reservation_import_rejections (hotel_id, batch_id, row_number, error_code, safe_detail)
         VALUES ($1,$2,$3,$4,$5)`,
        [principal.hotelId, values.preview.batchId, rejection.rowNumber, rejection.code, rejection.detail],
      );
    }
    const status = values.preview.rejectedRows.length ? "PARTIALLY_REJECTED" : "COMPLETED";
    await client.query(
      `UPDATE reservation_import_batches SET status=$2, accepted_rows=$3, completed_at=now() WHERE id=$1`,
      [values.preview.batchId, status, values.preview.reservations.length],
    );
    return {
      batchId: values.preview.batchId,
      status,
      created: accepted,
      updated,
      rejected: values.preview.rejectedRows.length,
    };
  }

  private async upsertReservation(
    client: DatabaseClient,
    hotelId: string,
    batchId: string,
    reservation: CanonicalReservation,
  ) {
    const id = randomUUID();
    const encryptedEmail = reservation.primaryGuest.email
      ? this.security.encryptPii(this.security.normalizeEmail(reservation.primaryGuest.email))
      : null;
    const emailHash = reservation.primaryGuest.email
      ? this.security.emailLookupHash(hotelId, reservation.primaryGuest.email)
      : null;
    const result = await client.query<{ id: string; created: boolean }>(
      `INSERT INTO reservations
        (id, hotel_id, source_system, external_reservation_id, source_version, status, booking_source,
         confirmation_code, primary_guest_name, primary_guest_email_encrypted, primary_guest_email_hash,
         nationality, preferred_locale, check_in_at, check_out_at, source_payload, source_updated_at, import_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT (hotel_id, source_system, external_reservation_id) DO UPDATE SET
         source_version=EXCLUDED.source_version, status=EXCLUDED.status, booking_source=EXCLUDED.booking_source,
         confirmation_code=EXCLUDED.confirmation_code, primary_guest_name=EXCLUDED.primary_guest_name,
         primary_guest_email_encrypted=EXCLUDED.primary_guest_email_encrypted,
         primary_guest_email_hash=EXCLUDED.primary_guest_email_hash, nationality=EXCLUDED.nationality,
         preferred_locale=EXCLUDED.preferred_locale, check_in_at=EXCLUDED.check_in_at, check_out_at=EXCLUDED.check_out_at,
         source_payload=EXCLUDED.source_payload, source_updated_at=EXCLUDED.source_updated_at,
         import_batch_id=EXCLUDED.import_batch_id, updated_at=now()
       WHERE EXCLUDED.source_updated_at >= reservations.source_updated_at
       RETURNING id, (xmax = 0) AS created`,
      [
        id,
        hotelId,
        reservation.sourceSystem,
        reservation.externalReservationId,
        reservation.updatedAtSource,
        reservation.status,
        reservation.bookingSource,
        reservation.confirmationCode,
        reservation.primaryGuest.name,
        encryptedEmail,
        emailHash,
        reservation.primaryGuest.nationality,
        reservation.primaryGuest.preferredLanguage,
        reservation.checkInAt,
        reservation.checkOutAt,
        JSON.stringify(reservation),
        reservation.updatedAtSource,
        batchId,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new AppError("CONFLICT", 409, false, { reason: "STALE_SOURCE_VERSION" });
    await client.query("DELETE FROM reservation_rooms WHERE hotel_id=$1 AND reservation_id=$2", [
      hotelId,
      row.id,
    ]);
    for (const room of reservation.rooms) {
      await client.query(
        `INSERT INTO reservation_rooms
          (hotel_id, reservation_id, external_room_id, room_type, room_number, adults, children)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [hotelId, row.id, room.externalRoomId, room.roomType, room.roomNumber, room.adults, room.children],
      );
    }
    await client.query(
      `INSERT INTO stays (hotel_id, reservation_id, lifecycle)
       VALUES ($1,$2,'UPCOMING') ON CONFLICT (hotel_id, reservation_id) DO NOTHING`,
      [hotelId, row.id],
    );
    return { reservationId: row.id, created: row.created };
  }
}
