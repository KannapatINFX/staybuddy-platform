import { describe, expect, it } from "vitest";
import { processAppBuildJob, processDomainEvent } from "./processor.js";

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

  it("keeps one hotel build failure isolated from another hotel lane", async () => {
    const base = {
      hotelAppId: "hotel-app-synthetic",
      platform: "IOS" as const,
      tenantSlug: "synthetic-hotel",
      profile: "PREVIEW" as const,
      commitSha: "abcdef1234567",
    };
    const [failed, built] = await Promise.all([
      processAppBuildJob({ ...base, buildJobId: "build-hotel-a", hotelId: "hotel-a" }, async () => {
        throw new Error("ASSET_VALIDATION_FAILED");
      }),
      processAppBuildJob({ ...base, buildJobId: "build-hotel-b", hotelId: "hotel-b" }, async (job) => ({
        artifactReference: `local://${job.buildJobId}`,
      })),
    ]);
    expect(failed).toMatchObject({ buildJobId: "build-hotel-a", status: "FAILED" });
    expect(built).toEqual({
      buildJobId: "build-hotel-b",
      status: "BUILT",
      artifactReference: "local://build-hotel-b",
    });
  });
});
