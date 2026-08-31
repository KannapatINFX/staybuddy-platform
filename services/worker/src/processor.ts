export type DomainEventJob = {
  eventId: string;
};

export async function processDomainEvent(job: DomainEventJob) {
  return { processed: true as const, eventId: job.eventId };
}
