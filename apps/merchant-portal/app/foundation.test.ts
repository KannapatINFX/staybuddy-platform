import { describe, expect, it } from "vitest";
import { merchantPortalFoundation } from "./foundation";

describe("Merchant Portal phase boundary", () => {
  it("stays deferred and excludes hotel guest CRM data", () => {
    expect(merchantPortalFoundation.releasePhase).toBe(2);
    expect(merchantPortalFoundation.exposesHotelGuestCrmData).toBe(false);
  });
});
