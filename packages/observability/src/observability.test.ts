import { describe, expect, it } from "vitest";
import { injectTraceHeaders } from "./index.js";

describe("observability foundation", () => {
  it("supports trace propagation without replacing caller headers", () => {
    const headers = { "x-correlation-id": "synthetic-correlation" };
    expect(injectTraceHeaders(headers)).toBe(headers);
    expect(headers["x-correlation-id"]).toBe("synthetic-correlation");
  });
});
