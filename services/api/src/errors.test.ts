import { describe, expect, it } from "vitest";
import { AppError } from "./errors.js";

describe("API unit-test harness", () => {
  it("preserves a safe machine error contract", () => {
    const error = new AppError("FOUNDATION_SMOKE", 409, true, { source: "synthetic" });
    expect(error).toMatchObject({
      name: "AppError",
      code: "FOUNDATION_SMOKE",
      status: 409,
      retryable: true,
      metadata: { source: "synthetic" },
    });
  });
});
