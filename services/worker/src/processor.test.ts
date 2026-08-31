import { describe, expect, it } from "vitest";
import { processDomainEvent } from "./processor.js";

describe("worker unit-test harness", () => {
  it("returns a deterministic receipt for a synthetic domain event", async () => {
    await expect(
      processDomainEvent({
        eventId: "event-synthetic-1",
        traceHeaders: { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
      }),
    ).resolves.toEqual({
      processed: true,
      eventId: "event-synthetic-1",
    });
  });
});
