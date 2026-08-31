import { describe, expect, it } from "vitest";
import { opsAdminFoundation } from "./foundation";

describe("Ops Admin foundation", () => {
  it("uses synthetic data and retains the hotel onboarding route", () => {
    expect(opsAdminFoundation.dataClassification).toBe("SYNTHETIC");
    expect(opsAdminFoundation.hotelOnboardingRoute).toBe("/hotels/new");
  });
});
