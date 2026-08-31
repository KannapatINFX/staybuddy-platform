import { describe, expect, it } from "vitest";
import { assertConciergeCopy, pendingConfirmationEnvelope, renderGuestMessage } from "./index.js";

describe("concierge foundation", () => {
  it("blocks known generic/system guest copy", () => {
    expect(() => assertConciergeCopy("Request submitted.")).toThrow("GUEST_COPY_VOICE_VIOLATION");
  });

  it("renders reviewed four-language templates", () => {
    expect(renderGuestMessage("th", "claim.expired")).toContain("แผนกต้อนรับ");
  });

  it("never represents an unknown availability as confirmed", () => {
    expect(pendingConfirmationEnvelope("Spa at 4 PM", "The spa team will respond")).toEqual(
      expect.objectContaining({ status: "PENDING_CONFIRMATION", confirmed: false }),
    );
  });
});
