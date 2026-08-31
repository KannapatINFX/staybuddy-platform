import "./instrumentation.js";
import { randomUUID } from "node:crypto";
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createDatabasePool } from "@staybuddy/db";
import { captureException, stopObservability } from "@staybuddy/observability";
import { runOutboxRelay } from "./outbox-relay.js";
import { processDomainEvent } from "./processor.js";

const redisUrl =
  process.env.REDIS_URL ?? (process.env.REDIS_HOST ? `rediss://${process.env.REDIS_HOST}:6379` : undefined);
if (!redisUrl) throw new Error("REDIS_URL is required");
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
const pool = createDatabasePool();
const queue = new Queue("staybuddy-domain-events", { connection });
const relayAbort = new AbortController();
const relayWorkerId = `outbox-${process.env.HOSTNAME ?? randomUUID()}`;

const worker = new Worker(
  "staybuddy-domain-events",
  async (job) =>
    processDomainEvent({
      eventId: job.data.eventId as string,
      ...(typeof job.data.hotelId === "string" ? { hotelId: job.data.hotelId } : {}),
      ...(typeof job.data.eventType === "string" ? { eventType: job.data.eventType } : {}),
      ...(typeof job.data.schemaVersion === "number" ? { schemaVersion: job.data.schemaVersion } : {}),
      ...(typeof job.data.aggregateType === "string" ? { aggregateType: job.data.aggregateType } : {}),
      ...(typeof job.data.aggregateId === "string" ? { aggregateId: job.data.aggregateId } : {}),
      payload: job.data.payload,
      ...(typeof job.data.correlationId === "string" ? { correlationId: job.data.correlationId } : {}),
      ...(typeof job.data.causationId === "string" ? { causationId: job.data.causationId } : {}),
      ...(typeof job.data.commandId === "string" ? { commandId: job.data.commandId } : {}),
      traceHeaders: isTraceHeaders(job.data.traceHeaders) ? job.data.traceHeaders : {},
    }),
  { connection, concurrency: 10 },
);

const relayPromise = runOutboxRelay({
  pool,
  workerId: relayWorkerId,
  signal: relayAbort.signal,
  publisher: {
    async publish(event) {
      await queue.add(
        "domain-event",
        {
          eventId: event.id,
          ...(event.hotelId ? { hotelId: event.hotelId } : {}),
          eventType: event.eventType,
          schemaVersion: event.schemaVersion,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          payload: event.payload,
          correlationId: event.correlationId,
          ...(event.causationId ? { causationId: event.causationId } : {}),
          ...(event.commandId ? { commandId: event.commandId } : {}),
        },
        { jobId: event.id, attempts: 5, backoff: { type: "exponential", delay: 1_000 } },
      );
    },
  },
  onPass(result) {
    if (result.failed || result.deadLettered) {
      console.error(JSON.stringify({ level: "error", event: "outbox.relay", ...result }));
    }
  },
  onError(error) {
    captureException(error, { service: "staybuddy-worker", component: "outbox-relay" });
    console.error(JSON.stringify({ level: "error", event: "outbox.relay.failed", code: errorName(error) }));
  },
});

worker.on("failed", (job, error) => {
  captureException(error, { service: "staybuddy-worker", jobId: job?.id ?? "unknown" });
  console.error(JSON.stringify({ level: "error", event: "job.failed", jobId: job?.id, code: error.name }));
});

async function shutdown() {
  relayAbort.abort();
  await relayPromise;
  await worker.close();
  await queue.close();
  await pool.end();
  await connection.quit();
  await stopObservability();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

function isTraceHeaders(value: unknown): value is Record<string, string> {
  return Boolean(
    value &&
    typeof value === "object" &&
    Object.values(value).every((header) => typeof header === "string" && header.length <= 512),
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
