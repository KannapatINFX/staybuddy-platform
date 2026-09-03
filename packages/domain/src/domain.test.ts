import { describe, expect, it } from "vitest";
import {
  aiWalletChargeMinor,
  assertGuestLifecycleTransition,
  assertRequestTransition,
  hotelCommerceCommissionMinor,
  canHotel,
  canPlatform,
  isHotelRole,
  isPlatformRole,
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

  it("enforces platform permissions from enumerated roles", () => {
    expect(isPlatformRole("STAYBUDDY_SUPER_ADMIN")).toBe(true);
    expect(isPlatformRole("ROOT")).toBe(false);
    expect(canPlatform("STAYBUDDY_SUPER_ADMIN", "platform.hotels.create")).toBe(true);
    expect(canPlatform("STAYBUDDY_SUPPORT", "platform.hotels.create")).toBe(false);
    expect(canPlatform("STAYBUDDY_SUPER_ADMIN", "platform.hotels.configure")).toBe(true);
    expect(canPlatform("STAYBUDDY_SUPPORT", "platform.hotels.configure")).toBe(false);
    expect(canPlatform("STAYBUDDY_SUPPORT", "platform.hotels.read")).toBe(true);
  });

  it("requires department-scoped roles to match the resource department", () => {
    expect(isHotelRole("DEPARTMENT_AGENT")).toBe(true);
    expect(isHotelRole("PLATFORM_OWNER")).toBe(false);
    expect(
      canHotel({ role: "DEPARTMENT_AGENT", departmentId: "housekeeping" }, "hotel.department-work.manage", {
        departmentId: "housekeeping",
      }),
    ).toBe(true);
    expect(
      canHotel({ role: "DEPARTMENT_AGENT", departmentId: "housekeeping" }, "hotel.department-work.manage", {
        departmentId: "engineering",
      }),
    ).toBe(false);
  });
});
