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
