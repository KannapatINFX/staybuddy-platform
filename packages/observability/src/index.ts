import { context, propagation, trace, type Span, SpanStatusCode } from "@opentelemetry/api";

export type CorrelationContext = {
  traceId: string;
  correlationId: string;
  commandId?: string;
};

export function currentTraceId(): string | undefined {
  return trace.getSpan(context.active())?.spanContext().traceId;
}

export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  action: (span: Span) => Promise<T>,
): Promise<T> {
  return trace.getTracer("staybuddy-platform").startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await action(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error("Unknown error"));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function injectTraceHeaders(target: Record<string, string>): Record<string, string> {
  propagation.inject(context.active(), target);
  return target;
}
