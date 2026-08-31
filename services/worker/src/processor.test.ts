import { describe, expect, it } from "vitest";
import { processDomainEvent } from "./processor.js";

describe("worker unit-test harness", () => {
  it("returns a deterministic receipt for a synthetic domain event", async () => {
    await expect(processDomainEvent({ eventId: "event-synthetic-1" })).resolves.toEqual({
      processed: true,
      eventId: "event-synthetic-1",
    });
  });
});
