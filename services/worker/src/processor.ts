import { withExtractedTrace, withSpan } from "@staybuddy/observability";

export type DomainEventJob = {
  eventId: string;
  hotelId?: string;
  eventType?: string;
  schemaVersion?: number;
  aggregateType?: string;
  aggregateId?: string;
  payload?: unknown;
  correlationId?: string;
  causationId?: string;
  commandId?: string;
  traceHeaders?: Record<string, string>;
};

export async function processDomainEvent(job: DomainEventJob) {
  return withExtractedTrace(job.traceHeaders ?? {}, () =>
    withSpan("worker.domain-event.process", { "messaging.message.id": job.eventId }, async () => ({
      processed: true as const,
      eventId: job.eventId,
    })),
  );
}

export type AppBuildWork = {
  buildJobId: string;
  hotelId: string;
  hotelAppId: string;
  platform: "IOS" | "ANDROID";
  tenantSlug: string;
  profile: "DEVELOPMENT" | "PREVIEW" | "PRODUCTION";
  commitSha: string;
};

export type AppBuildExecutor = (job: AppBuildWork) => Promise<{ artifactReference: string }>;

export async function processAppBuildJob(job: AppBuildWork, execute: AppBuildExecutor) {
  return withSpan(
    "worker.app-build.process",
    {
      "staybuddy.hotel.id": job.hotelId,
      "staybuddy.app.id": job.hotelAppId,
      "staybuddy.app_build.id": job.buildJobId,
    },
    async () => {
      try {
        const result = await execute(job);
        return { buildJobId: job.buildJobId, status: "BUILT" as const, ...result };
      } catch (error) {
        return {
          buildJobId: job.buildJobId,
          status: "FAILED" as const,
          failureCode: error instanceof Error && error.message ? error.message : "APP_BUILD_FAILED",
        };
      }
    },
  );
}
