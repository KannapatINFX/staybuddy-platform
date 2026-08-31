import { describe, expect, it } from "vitest";
import { coreTokens, semanticState } from "./index.js";

describe("UI foundation", () => {
  it("keeps the minimum accessible touch target and explicit critical state", () => {
    expect(coreTokens.touchTarget).toBeGreaterThanOrEqual(48);
    expect(semanticState.critical.icon).toBeTruthy();
  });
});
