import { describe, expect, it } from "vitest";
import { previewCsv, reservationIdempotencyKey, type ImportMapping } from "./index.js";

const mapping: ImportMapping = {
  sourceSystem: "csv-demo",
  columns: {
    externalReservationId: "reservation_id",
    status: "status",
    bookingSource: "source",
    confirmationCode: "confirmation",
    guestName: "guest_name",
    guestEmail: "email",
    nationality: "nationality",
    preferredLanguage: "language",
    checkInAt: "check_in",
    checkOutAt: "check_out",
    roomType: "room_type",
    roomNumber: "room_number",
    adults: "adults",
    children: "children",
    updatedAtSource: "updated_at",
  },
  defaults: { timezone: "Asia/Bangkok" },
};

describe("CSV reservation fallback", () => {
  it("returns valid rows and explainable rejected rows", () => {
    const preview = previewCsv(
      [
        "reservation_id,status,source,confirmation,guest_name,email,nationality,language,check_in,check_out,room_type,room_number,adults,children,updated_at",
        "R-1,CONFIRMED,agoda,C-1,Anna,anna@example.com,RU,ru,2026-09-01T07:00:00Z,2026-09-04T05:00:00Z,Deluxe,,2,0,2026-08-30T00:00:00Z",
        "R-2,CONFIRMED,direct,C-2,Bad Date,bad@example.com,TH,th,invalid,2026-09-04T05:00:00Z,Suite,,2,0,2026-08-30T00:00:00Z",
      ].join("\n"),
      mapping,
    );
    expect(preview.totalRows).toBe(2);
    expect(preview.validRows).toBe(1);
    expect(preview.rejectedRows[0]).toEqual(
      expect.objectContaining({ rowNumber: 3, code: "INVALID_RESERVATION" }),
    );
  });

  it("creates stable import idempotency keys", () => {
    const reservation = previewCsv(
      "reservation_id,status,source,confirmation,guest_name,check_in,check_out,updated_at\nR-1,CONFIRMED,direct,C-1,Anna,2026-09-01T07:00:00Z,2026-09-04T05:00:00Z,2026-08-30T00:00:00Z",
      mapping,
    ).reservations[0];
    expect(reservation).toBeDefined();
    expect(reservationIdempotencyKey("hotel-a", reservation!)).toBe(
      reservationIdempotencyKey("hotel-a", reservation!),
    );
  });
});
