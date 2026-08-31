import { withExtractedTrace, withSpan } from "@staybuddy/observability";

export type DomainEventJob = {
  eventId: string;
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
