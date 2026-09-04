import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  CanonicalReservationSchema,
  ImportMappingSchema,
  type CanonicalReservation,
} from "@staybuddy/contracts";
import {
  appendAuditAndOutbox,
  executeIdempotent,
  type DatabaseClient,
  type DatabasePool,
  withPlatformTransaction,
  withTenantTransaction,
} from "@staybuddy/db";
import { previewCsv, type ImportMapping, type ImportPreview } from "@staybuddy/pms-sdk";
import { z } from "zod";
import { DATABASE_POOL } from "./database.module.js";
import { AppError } from "./errors.js";
import type { HotelPrincipal, PlatformPrincipal } from "./principal.service.js";
import { SecurityService } from "./security.service.js";

const PreviewInputSchema = z
  .object({
    csv: z.string().min(1).max(10_000_000),
    mapping: ImportMappingSchema.optional(),
    mappingProfileId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.mapping) !== Boolean(v.mappingProfileId), {
    message: "Provide exactly one mapping or mappingProfileId",
  });
const CommitInputSchema = z
  .object({
    previewId: z.string().uuid(),
    mappingName: z.string().min(1).max(120).optional(),
    saveMapping: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.saveMapping || Boolean(v.mappingName), {
    message: "mappingName is required when saveMapping is true",
  });
const SaveMappingSchema = z
  .object({ name: z.string().min(1).max(120), mapping: ImportMappingSchema })
  .strict();
type Outcome = "CREATED" | "UPDATED" | "UNCHANGED" | "CONFLICTED";

@Injectable()
export class ReservationService {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: DatabasePool,
    private readonly security: SecurityService,
  ) {}

  async preview(input: unknown, principal: HotelPrincipal) {
    const values = PreviewInputSchema.parse(input);
    return withTenantTransaction(this.pool, this.context(principal), async (client) => {
      const mapping =
        values.mapping ?? (await this.getMapping(client, principal.hotelId, values.mappingProfileId!));
      const result = previewCsv(values.csv, mapping);
      const previewId = randomUUID();
      const expiresAt = new Date(Date.now() + 86_400_000);
      await client.query(
        `INSERT INTO reservation_import_previews (id,hotel_id,source_system,source_sha256,encrypted_source,mapping,total_rows,valid_rows,rejected_rows,created_by,expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          previewId,
          principal.hotelId,
          mapping.sourceSystem,
          createHash("sha256").update(values.csv).digest("hex"),
          this.security.encryptPii(values.csv),
          JSON.stringify(mapping),
          result.totalRows,
          result.validRows,
          result.rejectedRows.length,
          principal.actorId,
          expiresAt,
        ],
      );
      return {
        previewId,
        totalRows: result.totalRows,
        validRows: result.validRows,
        rejectedRows: result.rejectedRows,
        reservations: result.reservations,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async commit(input: unknown, principal: HotelPrincipal, key?: string) {
    const values = CommitInputSchema.parse(input);
    return this.idempotent(principal, key, values, async (client) => {
      const staged = await this.loadPreview(client, principal.hotelId, values.previewId, true);
      const preview = previewCsv(this.security.decryptPii(staged.encryptedSource), staged.mapping);
      const mappingProfileId = values.saveMapping
        ? await this.insertMapping(client, principal, values.mappingName!, staged.mapping)
        : null;
      const body = await this.persistBatch(client, preview, staged.mapping, principal, key!, {
        previewId: values.previewId,
        mappingProfileId,
      });
      await client.query("UPDATE reservation_import_previews SET consumed_at=now() WHERE id=$1", [
        values.previewId,
      ]);
      return body;
    });
  }

  async retry(batchId: string, input: unknown, principal: HotelPrincipal, key?: string) {
    z.object({}).strict().parse(input);
    return this.idempotent(principal, key, { batchId }, async (client) => {
      const batch = await client.query<{ preview_id: string | null }>(
        "SELECT preview_id FROM reservation_import_batches WHERE hotel_id=$1 AND id=$2",
        [principal.hotelId, batchId],
      );
      const previewId = batch.rows[0]?.preview_id;
      if (!previewId) throw new AppError("NOT_FOUND", 404);
      const staged = await this.loadPreview(client, principal.hotelId, previewId, false);
      const preview = previewCsv(this.security.decryptPii(staged.encryptedSource), staged.mapping);
      return this.persistBatch(client, preview, staged.mapping, principal, key!, {
        previewId,
        retryOfBatchId: batchId,
      });
    });
  }

  async createManual(input: unknown, principal: HotelPrincipal, key?: string) {
    const raw = typeof input === "object" && input !== null ? input : {};
    const reservation = CanonicalReservationSchema.parse({
      ...raw,
      sourceSystem: "MANUAL",
      externalReservationId:
        "externalReservationId" in raw && typeof raw.externalReservationId === "string"
          ? raw.externalReservationId
          : `MANUAL-${randomUUID()}`,
      updatedAtSource: new Date().toISOString(),
    });
    return this.idempotent(principal, key, reservation, (client) =>
      this.persistBatch(
        client,
        { batchId: randomUUID(), totalRows: 1, validRows: 1, rejectedRows: [], reservations: [reservation] },
        this.manualMapping(reservation.timezone),
        principal,
        key!,
        {},
      ),
    );
  }

  async saveMapping(input: unknown, principal: HotelPrincipal) {
    const values = SaveMappingSchema.parse(input);
    return withTenantTransaction(this.pool, this.context(principal), async (client) => ({
      id: await this.insertMapping(client, principal, values.name, values.mapping),
    }));
  }

  async listMappings(principal: HotelPrincipal) {
    return withTenantTransaction(this.pool, this.context(principal), (client) =>
      client
        .query(
          `SELECT id,name,source_system AS "sourceSystem",version,mapping,created_at AS "createdAt" FROM reservation_mapping_profiles WHERE hotel_id=$1 AND active=true ORDER BY name,version DESC`,
          [principal.hotelId],
        )
        .then((r) => r.rows),
    );
  }

  async listImports(principal: HotelPrincipal) {
    return withTenantTransaction(this.pool, this.context(principal), (client) =>
      client
        .query(
          `SELECT id,source_system AS "sourceSystem",status,total_rows AS "totalRows",created_rows AS created,updated_rows AS updated,unchanged_rows AS unchanged,conflicted_rows AS conflicted,rejected_rows AS rejected,retry_of_batch_id AS "retryOfBatchId",created_at AS "createdAt",completed_at AS "completedAt" FROM reservation_import_batches WHERE hotel_id=$1 ORDER BY created_at DESC LIMIT 100`,
          [principal.hotelId],
        )
        .then((r) => r.rows),
    );
  }

  async getImport(batchId: string, principal: HotelPrincipal) {
    return withTenantTransaction(this.pool, this.context(principal), async (client) => {
      const batch = await client.query(
        `SELECT id,source_system AS "sourceSystem",status,total_rows AS "totalRows",created_rows AS created,updated_rows AS updated,unchanged_rows AS unchanged,conflicted_rows AS conflicted,rejected_rows AS rejected,retry_of_batch_id AS "retryOfBatchId",created_at AS "createdAt",completed_at AS "completedAt" FROM reservation_import_batches WHERE hotel_id=$1 AND id=$2`,
        [principal.hotelId, batchId],
      );
      if (!batch.rows[0]) throw new AppError("NOT_FOUND", 404);
      const rejects = await client.query(
        `SELECT row_number AS "rowNumber",error_code AS code,safe_detail AS detail,created_at AS "createdAt" FROM reservation_import_rejections WHERE hotel_id=$1 AND batch_id=$2 ORDER BY row_number`,
        [principal.hotelId, batchId],
      );
      return { ...batch.rows[0], rejections: rejects.rows };
    });
  }

  async listUpcoming(principal: HotelPrincipal, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 30 * 86_400_000);
    if (Number.isNaN(fromDate.valueOf()) || Number.isNaN(toDate.valueOf()) || fromDate >= toDate)
      throw new AppError("INVALID_REQUEST", 400);
    return withTenantTransaction(this.pool, this.context(principal), async (client) => {
      const result = await client.query(
        `SELECT r.id,r.external_reservation_id AS "externalReservationId",r.status,r.booking_source AS "bookingSource",r.confirmation_code AS "confirmationCode",r.primary_guest_name AS "primaryGuestName",r.nationality,r.preferred_locale AS "preferredLocale",r.check_in_at AS "checkInAt",r.check_out_at AS "checkOutAt",s.id AS "stayId",s.lifecycle,rr.room_type AS "roomType",rr.room_number AS "roomNumber" FROM reservations r JOIN stays s ON s.reservation_id=r.id AND s.hotel_id=r.hotel_id LEFT JOIN reservation_rooms rr ON rr.reservation_id=r.id AND rr.hotel_id=r.hotel_id WHERE r.hotel_id=$1 AND r.check_in_at >= $2 AND r.check_in_at < $3 ORDER BY r.check_in_at`,
        [principal.hotelId, fromDate, toDate],
      );
      return result.rows.map((row) => this.iso(row, ["checkInAt", "checkOutAt"]));
    });
  }

  async getReservation(id: string, principal: HotelPrincipal) {
    return withTenantTransaction(this.pool, this.context(principal), async (client) => {
      const result = await client.query(
        `SELECT r.id,r.source_system AS "sourceSystem",r.external_reservation_id AS "externalReservationId",r.source_version AS "sourceVersion",r.status,r.booking_source AS "bookingSource",r.confirmation_code AS "confirmationCode",r.primary_guest_name AS "primaryGuestName",r.nationality,r.preferred_locale AS "preferredLocale",r.check_in_at AS "checkInAt",r.check_out_at AS "checkOutAt",r.source_updated_at AS "sourceUpdatedAt",r.created_at AS "createdAt",r.updated_at AS "updatedAt",r.import_batch_id AS "importBatchId",s.id AS "stayId",s.lifecycle,COALESCE(jsonb_agg(jsonb_build_object('roomType',rr.room_type,'roomNumber',rr.room_number,'adults',rr.adults,'children',rr.children)) FILTER (WHERE rr.id IS NOT NULL),'[]') AS rooms FROM reservations r JOIN stays s ON s.reservation_id=r.id AND s.hotel_id=r.hotel_id LEFT JOIN reservation_rooms rr ON rr.reservation_id=r.id AND rr.hotel_id=r.hotel_id WHERE r.hotel_id=$1 AND r.id=$2 GROUP BY r.id,s.id`,
        [principal.hotelId, id],
      );
      if (!result.rows[0]) throw new AppError("NOT_FOUND", 404);
      return this.iso(result.rows[0], [
        "checkInAt",
        "checkOutAt",
        "sourceUpdatedAt",
        "createdAt",
        "updatedAt",
      ]);
    });
  }

  async hotelHealth(principal: HotelPrincipal) {
    return withTenantTransaction(this.pool, this.context(principal), (client) =>
      this.health(client, "WHERE h.id=$1", [principal.hotelId]).then((rows) => rows[0]),
    );
  }

  async platformHealth(principal: PlatformPrincipal) {
    return withPlatformTransaction(
      this.pool,
      { actorId: principal.actorId, platformRole: principal.role, traceId: randomUUID() },
      (client) => this.health(client, "", []),
    );
  }

  private async health(client: DatabaseClient, filter: string, params: unknown[]) {
    const result = await client.query(
      `SELECT h.id AS "hotelId",h.display_name AS "hotelName",b.status AS "lastStatus",b.created_at AS "lastAttemptAt",b.rejected_rows AS "lastRejected",CASE WHEN b.id IS NULL THEN 'FALLBACK_ONLY' WHEN b.status='FAILED' THEN 'FAILED' WHEN b.status='PARTIALLY_REJECTED' THEN 'PARTIAL' WHEN b.created_at < now()-interval '48 hours' THEN 'STALE' ELSE 'HEALTHY' END AS status FROM hotels h LEFT JOIN LATERAL (SELECT * FROM reservation_import_batches x WHERE x.hotel_id=h.id ORDER BY x.created_at DESC LIMIT 1) b ON true ${filter} ORDER BY h.display_name`,
      params,
    );
    return result.rows.map((row) => this.iso(row, ["lastAttemptAt"]));
  }

  private async persistBatch(
    client: DatabaseClient,
    preview: ImportPreview,
    mapping: ImportMapping,
    principal: HotelPrincipal,
    key: string,
    options: { previewId?: string; mappingProfileId?: string | null; retryOfBatchId?: string },
  ) {
    const batchId = randomUUID();
    await client.query(
      `INSERT INTO reservation_import_batches (id,hotel_id,source_system,mapping_profile_id,preview_id,retry_of_batch_id,status,total_rows,rejected_rows,requested_by) VALUES ($1,$2,$3,$4,$5,$6,'PROCESSING',$7,$8,$9)`,
      [
        batchId,
        principal.hotelId,
        mapping.sourceSystem,
        options.mappingProfileId,
        options.previewId,
        options.retryOfBatchId,
        preview.totalRows,
        preview.rejectedRows.length,
        principal.actorId,
      ],
    );
    const counts = { created: 0, updated: 0, unchanged: 0, conflicted: 0 };
    for (const [index, reservation] of preview.reservations.entries()) {
      const result = await this.upsertReservation(client, principal.hotelId, batchId, reservation);
      counts[result.outcome.toLowerCase() as Lowercase<Outcome>] += 1;
      if (result.outcome === "CREATED" || result.outcome === "UPDATED")
        await appendAuditAndOutbox(client, {
          hotelId: principal.hotelId,
          actor: { type: "HOTEL_STAFF", id: principal.actorId, role: principal.role },
          action: result.outcome === "CREATED" ? "reservation.imported" : "reservation.updated",
          resource: { type: "reservation", id: result.reservationId },
          event: {
            type: result.outcome === "CREATED" ? "reservation.imported" : "reservation.updated",
            aggregateType: "reservation",
            aggregateId: result.reservationId,
            payload: {
              sourceSystem: reservation.sourceSystem,
              externalReservationId: reservation.externalReservationId,
            },
          },
          traceId: randomUUID(),
          correlationId: batchId,
          idempotencyKey: key,
        });
      if (result.outcome === "CONFLICTED")
        await client.query(
          `INSERT INTO reservation_import_rejections (hotel_id,batch_id,row_number,error_code,safe_detail) VALUES ($1,$2,$3,'SOURCE_VERSION_CONFLICT',$4)`,
          [principal.hotelId, batchId, index + 2, result.reason],
        );
    }
    for (const reject of preview.rejectedRows)
      await client.query(
        `INSERT INTO reservation_import_rejections (hotel_id,batch_id,row_number,error_code,safe_detail) VALUES ($1,$2,$3,$4,$5)`,
        [principal.hotelId, batchId, reject.rowNumber, reject.code, reject.detail],
      );
    const rejected = preview.rejectedRows.length;
    const status = rejected || counts.conflicted ? "PARTIALLY_REJECTED" : "COMPLETED";
    await client.query(
      `UPDATE reservation_import_batches SET status=$2,accepted_rows=$3,created_rows=$4,updated_rows=$5,unchanged_rows=$6,conflicted_rows=$7,completed_at=now() WHERE hotel_id=$1 AND id=$8`,
      [
        principal.hotelId,
        status,
        counts.created + counts.updated + counts.unchanged,
        counts.created,
        counts.updated,
        counts.unchanged,
        counts.conflicted,
        batchId,
      ],
    );
    return { batchId, status, ...counts, rejected };
  }

  private async upsertReservation(
    client: DatabaseClient,
    hotelId: string,
    batchId: string,
    reservation: CanonicalReservation,
  ) {
    const payload = JSON.stringify(reservation);
    const canonicalPayload = stableStringify(reservation);
    const digest = createHash("sha256").update(canonicalPayload).digest("hex");
    const found = await client.query<{
      id: string;
      source_updated_at: Date;
      source_payload_sha256: string;
      source_payload: unknown;
    }>(
      `SELECT id,source_updated_at,source_payload_sha256,source_payload FROM reservations WHERE hotel_id=$1 AND source_system=$2 AND external_reservation_id=$3 FOR UPDATE`,
      [hotelId, reservation.sourceSystem, reservation.externalReservationId],
    );
    const current = found.rows[0];
    const reservationId = current?.id ?? randomUUID();
    const outcome: Outcome = current ? "UPDATED" : "CREATED";
    if (current) {
      const incoming = new Date(reservation.updatedAtSource).valueOf(),
        existing = current.source_updated_at.valueOf();
      if (incoming < existing)
        return { reservationId, outcome: "CONFLICTED" as const, reason: "Incoming source version is older" };
      if (
        incoming === existing &&
        (digest === current.source_payload_sha256 ||
          stableStringify(current.source_payload) === canonicalPayload)
      ) {
        if (digest !== current.source_payload_sha256)
          await client.query("UPDATE reservations SET source_payload_sha256=$3 WHERE hotel_id=$1 AND id=$2", [
            hotelId,
            reservationId,
            digest,
          ]);
        return { reservationId, outcome: "UNCHANGED" as const };
      }
      if (incoming === existing)
        return {
          reservationId,
          outcome: "CONFLICTED" as const,
          reason: "Equal source version has different content",
        };
    }
    const encryptedEmail = reservation.primaryGuest.email
      ? this.security.encryptPii(this.security.normalizeEmail(reservation.primaryGuest.email))
      : null;
    const emailHash = reservation.primaryGuest.email
      ? this.security.emailLookupHash(hotelId, reservation.primaryGuest.email)
      : null;
    const encryptedPhone = reservation.primaryGuest.phone
      ? this.security.encryptPii(reservation.primaryGuest.phone)
      : null;
    const values = [
      reservationId,
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
      encryptedPhone,
      reservation.primaryGuest.nationality,
      reservation.primaryGuest.preferredLanguage,
      reservation.checkInAt,
      reservation.checkOutAt,
      payload,
      digest,
      reservation.updatedAtSource,
      batchId,
    ];
    if (outcome === "CREATED")
      await client.query(
        `INSERT INTO reservations (id,hotel_id,source_system,external_reservation_id,source_version,status,booking_source,confirmation_code,primary_guest_name,primary_guest_email_encrypted,primary_guest_email_hash,primary_guest_phone_encrypted,nationality,preferred_locale,check_in_at,check_out_at,source_payload,source_payload_sha256,source_updated_at,import_batch_id) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")})`,
        values,
      );
    else {
      await client.query(
        `UPDATE reservations SET source_version=$3,status=$4,booking_source=$5,confirmation_code=$6,primary_guest_name=$7,primary_guest_email_encrypted=$8,primary_guest_email_hash=$9,primary_guest_phone_encrypted=$10,nationality=$11,preferred_locale=$12,check_in_at=$13,check_out_at=$14,source_payload=$15,source_payload_sha256=$16,source_updated_at=$17,import_batch_id=$18,updated_at=now() WHERE hotel_id=$1 AND id=$2`,
        [
          hotelId,
          reservationId,
          reservation.updatedAtSource,
          reservation.status,
          reservation.bookingSource,
          reservation.confirmationCode,
          reservation.primaryGuest.name,
          encryptedEmail,
          emailHash,
          encryptedPhone,
          reservation.primaryGuest.nationality,
          reservation.primaryGuest.preferredLanguage,
          reservation.checkInAt,
          reservation.checkOutAt,
          payload,
          digest,
          reservation.updatedAtSource,
          batchId,
        ],
      );
      await client.query("DELETE FROM reservation_rooms WHERE hotel_id=$1 AND reservation_id=$2", [
        hotelId,
        reservationId,
      ]);
    }
    for (const room of reservation.rooms)
      await client.query(
        `INSERT INTO reservation_rooms (hotel_id,reservation_id,external_room_id,room_type,room_number,adults,children) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          hotelId,
          reservationId,
          room.externalRoomId,
          room.roomType,
          room.roomNumber,
          room.adults,
          room.children,
        ],
      );
    await client.query(
      `INSERT INTO stays (hotel_id,reservation_id,lifecycle) VALUES ($1,$2,'UPCOMING') ON CONFLICT (hotel_id,reservation_id) DO NOTHING`,
      [hotelId, reservationId],
    );
    return { reservationId, outcome };
  }

  private async loadPreview(
    client: DatabaseClient,
    hotelId: string,
    previewId: string,
    requireUsable: boolean,
  ) {
    const result = await client.query<{
      encrypted_source: string;
      mapping: unknown;
      expires_at: Date;
      consumed_at: Date | null;
    }>(
      `SELECT encrypted_source,mapping,expires_at,consumed_at FROM reservation_import_previews WHERE hotel_id=$1 AND id=$2 ${requireUsable ? "FOR UPDATE" : ""}`,
      [hotelId, previewId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError("NOT_FOUND", 404);
    if (requireUsable && (row.consumed_at || row.expires_at <= new Date()))
      throw new AppError("CONFLICT", 409, false, {
        reason: row.consumed_at ? "PREVIEW_CONSUMED" : "PREVIEW_EXPIRED",
      });
    return { encryptedSource: row.encrypted_source, mapping: ImportMappingSchema.parse(row.mapping) };
  }

  private async getMapping(client: DatabaseClient, hotelId: string, id: string) {
    const result = await client.query<{ mapping: unknown }>(
      "SELECT mapping FROM reservation_mapping_profiles WHERE hotel_id=$1 AND id=$2 AND active=true",
      [hotelId, id],
    );
    if (!result.rows[0]) throw new AppError("NOT_FOUND", 404);
    return ImportMappingSchema.parse(result.rows[0].mapping);
  }

  private async insertMapping(
    client: DatabaseClient,
    principal: HotelPrincipal,
    name: string,
    mapping: ImportMapping,
  ) {
    const result = await client.query<{ id: string }>(
      `INSERT INTO reservation_mapping_profiles (hotel_id,name,source_system,version,mapping,created_by) VALUES ($1,$2,$3,COALESCE((SELECT max(version)+1 FROM reservation_mapping_profiles WHERE hotel_id=$1 AND name=$2),1),$4,$5) RETURNING id`,
      [principal.hotelId, name, mapping.sourceSystem, JSON.stringify(mapping), principal.actorId],
    );
    return result.rows[0]!.id;
  }

  private async idempotent<T>(
    principal: HotelPrincipal,
    key: string | undefined,
    request: unknown,
    action: (client: DatabaseClient) => Promise<T>,
  ) {
    if (!key) throw new AppError("INVALID_REQUEST", 400, false, { field: "Idempotency-Key" });
    try {
      return await withTenantTransaction(this.pool, this.context(principal), (client) =>
        executeIdempotent(client, {
          hotelId: principal.hotelId,
          key,
          request,
          expiresAt: new Date(Date.now() + 86_400_000),
          action: async () => ({ status: 201, body: await action(client) }),
        }),
      );
    } catch (error) {
      if ((error as Error).message === "IDEMPOTENCY_KEY_REUSED")
        throw new AppError("IDEMPOTENCY_KEY_REUSED", 409);
      if ((error as Error).message === "IDEMPOTENCY_IN_PROGRESS")
        throw new AppError("IDEMPOTENCY_IN_PROGRESS", 409, true);
      throw error;
    }
  }

  private context(p: HotelPrincipal) {
    return { hotelId: p.hotelId, actorId: p.actorId, traceId: randomUUID() };
  }
  private manualMapping(timezone: string): ImportMapping {
    return {
      sourceSystem: "MANUAL",
      columns: {
        externalReservationId: "manual",
        status: "manual",
        bookingSource: "manual",
        confirmationCode: "manual",
        guestName: "manual",
        checkInAt: "manual",
        checkOutAt: "manual",
      },
      defaults: { timezone },
    };
  }
  private iso(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) if (row[key] instanceof Date) row[key] = row[key].toISOString();
    return row;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => (item === undefined ? "null" : stableStringify(item))).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
