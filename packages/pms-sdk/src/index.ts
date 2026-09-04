import type { CanonicalReservation, ImportPreviewSchema } from "@staybuddy/contracts";
import { CanonicalReservationSchema, ImportMappingSchema } from "@staybuddy/contracts";
import { parse } from "csv-parse/sync";
import { createHash, randomUUID } from "node:crypto";
import type { z } from "zod";

export type AdapterCapabilities = {
  pull: boolean;
  webhook: boolean;
  roomMapping: boolean;
  manualFallback: true;
};

export type ValidationResult = { valid: boolean; errors: string[] };
export type HealthStatus = { status: "HEALTHY" | "DEGRADED" | "FAILED"; checkedAt: string; detail?: string };

export interface ReservationAdapter<Config = unknown, Raw = unknown> {
  capabilities(): AdapterCapabilities;
  pullReservations(window: { from: string; to: string }): Promise<CanonicalReservation[]>;
  validateConfig(config: Config): Promise<ValidationResult>;
  normalize(raw: Raw): CanonicalReservation;
  healthCheck(): Promise<HealthStatus>;
}

export type ImportMapping = z.infer<typeof ImportMappingSchema>;
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export function reservationIdempotencyKey(hotelId: string, reservation: CanonicalReservation): string {
  const version = reservation.updatedAtSource;
  return createHash("sha256")
    .update(`${hotelId}:${reservation.sourceSystem}:${reservation.externalReservationId}:${version}`)
    .digest("hex");
}

export function previewCsv(csv: string, mappingInput: ImportMapping): ImportPreview {
  const mapping = ImportMappingSchema.parse(mappingInput);
  const rawRows = parse(csv, { columns: true, bom: true, skip_empty_lines: true, trim: true }) as Record<
    string,
    string
  >[];
  const reservations: CanonicalReservation[] = [];
  const rejectedRows: ImportPreview["rejectedRows"] = [];

  rawRows.forEach((row, index) => {
    const value = normalizeCsvRow(row, mapping);
    const result = CanonicalReservationSchema.safeParse(value);
    if (result.success) reservations.push(result.data);
    else {
      rejectedRows.push({
        rowNumber: index + 2,
        code: "INVALID_RESERVATION",
        detail: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      });
    }
  });

  return {
    batchId: randomUUID(),
    totalRows: rawRows.length,
    validRows: reservations.length,
    rejectedRows,
    reservations,
  };
}

function normalizeCsvRow(row: Record<string, string>, mapping: ImportMapping) {
  const field = (name?: string) => (name ? row[name] || undefined : undefined);
  const status = field(mapping.columns.status)?.toUpperCase();
  const updatedAt = field(mapping.columns.updatedAtSource) || new Date(0).toISOString();
  const room = {
    roomType: field(mapping.columns.roomType),
    roomNumber: field(mapping.columns.roomNumber),
    adults: toInteger(field(mapping.columns.adults)),
    children: toInteger(field(mapping.columns.children)),
  };
  return {
    sourceSystem: mapping.sourceSystem,
    externalReservationId: field(mapping.columns.externalReservationId),
    status,
    bookingSource: field(mapping.columns.bookingSource) || mapping.defaults.bookingSource,
    confirmationCode: field(mapping.columns.confirmationCode),
    primaryGuest: {
      name: field(mapping.columns.guestName),
      email: field(mapping.columns.guestEmail),
      phone: field(mapping.columns.guestPhone),
      nationality: field(mapping.columns.nationality)?.toUpperCase(),
      preferredLanguage: field(mapping.columns.preferredLanguage),
    },
    checkInAt: asUtc(field(mapping.columns.checkInAt)),
    checkOutAt: asUtc(field(mapping.columns.checkOutAt)),
    timezone: mapping.defaults.timezone,
    rooms: [room],
    updatedAtSource: asUtc(updatedAt),
  };
}

function asUtc(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
}

function toInteger(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
