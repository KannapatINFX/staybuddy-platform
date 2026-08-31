import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { processDomainEvent } from "./processor.js";

const redisUrl =
  process.env.REDIS_URL ?? (process.env.REDIS_HOST ? `rediss://${process.env.REDIS_HOST}:6379` : undefined);
if (!redisUrl) throw new Error("REDIS_URL is required");
const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  "staybuddy-domain-events",
  async (job) => processDomainEvent({ eventId: job.data.eventId as string }),
  { connection, concurrency: 10 },
);

worker.on("failed", (job, error) => {
  console.error(JSON.stringify({ level: "error", event: "job.failed", jobId: job?.id, code: error.name }));
});

process.on("SIGTERM", async () => {
  await worker.close();
  await connection.quit();
});
