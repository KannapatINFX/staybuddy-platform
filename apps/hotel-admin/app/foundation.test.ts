import { describe, expect, it } from "vitest";
import { hotelAdminFoundation } from "./foundation";

describe("Hotel Admin foundation", () => {
  it("keeps the canonical Today screen and manual reservation fallback", () => {
    expect(hotelAdminFoundation.screenId).toBe("SB-H-002");
    expect(hotelAdminFoundation.reservationFallbackLabel).toContain("CSV/manual");
  });
});
