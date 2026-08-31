import { describe, expect, it } from "vitest";
import {
  aiWalletChargeMinor,
  assertGuestLifecycleTransition,
  assertRequestTransition,
  hotelCommerceCommissionMinor,
  platformSubscriptionMinor,
} from "./index.js";

describe("locked domain rules", () => {
  it("allows pre-arrival activation but does not require it", () => {
    expect(() => assertGuestLifecycleTransition("UPCOMING", "PRE_ARRIVAL_ACTIVATED")).not.toThrow();
    expect(() => assertGuestLifecycleTransition("UPCOMING", "IN_HOUSE")).not.toThrow();
    expect(() => assertGuestLifecycleTransition("UPCOMING", "PAST_GUEST")).toThrow();
  });

  it("prevents skipping request completion semantics", () => {
    expect(() => assertRequestTransition("NEW", "RESOLVED")).toThrow();
    expect(() => assertRequestTransition("IN_PROGRESS", "RESOLVED")).not.toThrow();
  });

  it("implements the locked commercial calculations in minor units", () => {
    expect(platformSubscriptionMinor(20)).toBe(750_000);
    expect(platformSubscriptionMinor(80)).toBe(1_200_000);
    expect(hotelCommerceCommissionMinor(10_000)).toBe(500);
    expect(aiWalletChargeMinor(10_000)).toBe(11_250);
  });
});
