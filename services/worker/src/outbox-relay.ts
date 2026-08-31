import { setTimeout as delay } from "node:timers/promises";
import {
  claimOutboxEvents,
  markOutboxProcessed,
  recordOutboxFailure,
  withPlatformTransaction,
  withTenantTransaction,
  type ClaimedOutboxEvent,
  type DatabasePool,
} from "@staybuddy/db";

export type OutboxPublisher = {
  publish(event: ClaimedOutboxEvent): Promise<void>;
};

export type OutboxRelayResult = {
  claimed: number;
  published: number;
  failed: number;
  deadLettered: number;
};

type RelayOptions = {
  pool: DatabasePool;
  publisher: OutboxPublisher;
  workerId: string;
  batchSize?: number;
};

export async function runOutboxRelayPass(options: RelayOptions): Promise<OutboxRelayResult> {
  const batchSize = options.batchSize ?? 50;
  const traceId = `outbox-relay:${options.workerId}`;
  const globalEvents = await withPlatformTransaction(
    options.pool,
    { actorId: options.workerId, platformRole: "STAYBUDDY_SYSTEM", traceId },
    (client) => claimOutboxEvents(client, options.workerId, batchSize),
  );
  const hotels = await withPlatformTransaction(
    options.pool,
    { actorId: options.workerId, platformRole: "STAYBUDDY_TENANT_RESOLVER", traceId },
    (client) => client.query<{ id: string }>("SELECT id FROM hotels ORDER BY id"),
  );
  const tenantEvents: ClaimedOutboxEvent[] = [];
  for (const hotel of hotels.rows) {
    const remaining = batchSize - globalEvents.length - tenantEvents.length;
    if (remaining <= 0) break;
    tenantEvents.push(
      ...(await withTenantTransaction(
        options.pool,
        { hotelId: hotel.id, actorId: options.workerId, traceId },
        (client) => claimOutboxEvents(client, options.workerId, remaining),
      )),
    );
  }

  const events = [...globalEvents, ...tenantEvents];
  const result: OutboxRelayResult = { claimed: events.length, published: 0, failed: 0, deadLettered: 0 };
  for (const event of events) {
    try {
      await options.publisher.publish(event);
      await inEventScope(options.pool, options.workerId, event, (client) =>
        markOutboxProcessed(client, event.id, options.workerId),
      );
      result.published += 1;
    } catch (error) {
      const failure = await inEventScope(options.pool, options.workerId, event, (client) =>
        recordOutboxFailure(client, {
          eventId: event.id,
          workerId: options.workerId,
          errorCode: safeErrorCode(error),
        }),
      );
      result.failed += 1;
      if (failure.deadLettered) result.deadLettered += 1;
    }
  }
  return result;
}

export async function runOutboxRelay(
  options: RelayOptions & {
    signal: AbortSignal;
    intervalMs?: number;
    onPass?: (result: OutboxRelayResult) => void;
    onError?: (error: unknown) => void;
  },
): Promise<void> {
  const intervalMs = options.intervalMs ?? 1_000;
  while (!options.signal.aborted) {
    try {
      options.onPass?.(await runOutboxRelayPass(options));
    } catch (error) {
      options.onError?.(error);
    }
    try {
      await delay(intervalMs, undefined, { signal: options.signal });
    } catch (error) {
      if (!options.signal.aborted) throw error;
    }
  }
}

function inEventScope<T>(
  pool: DatabasePool,
  workerId: string,
  event: ClaimedOutboxEvent,
  action: Parameters<typeof withTenantTransaction<T>>[2],
): Promise<T> {
  if (event.hotelId) {
    return withTenantTransaction(
      pool,
      {
        hotelId: event.hotelId,
        actorId: workerId,
        traceId: event.traceId,
        correlationId: event.correlationId,
      },
      action,
    );
  }
  return withPlatformTransaction(
    pool,
    {
      actorId: workerId,
      platformRole: "STAYBUDDY_SYSTEM",
      traceId: event.traceId,
      correlationId: event.correlationId,
    },
    action,
  );
}

function safeErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : "UNKNOWN_ERROR";
  return name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 120) || "UNKNOWN_ERROR";
}
