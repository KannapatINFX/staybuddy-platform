import { describe, expect, it } from "vitest";
import { fingerprintRequest } from "./index.js";

describe("database helpers", () => {
  it("fingerprints equivalent object keys identically", () => {
    expect(fingerprintRequest({ b: 2, a: 1 })).toBe(fingerprintRequest({ a: 1, b: 2 }));
  });
});
