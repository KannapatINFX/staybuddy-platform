import { context, propagation, trace, type Span, SpanStatusCode } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { AWSXRayIdGenerator } from "@opentelemetry/id-generator-aws-xray";
import { defaultResource, resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import * as Sentry from "@sentry/node";

export type CorrelationContext = {
  traceId: string;
  correlationId: string;
  commandId?: string;
};

export type ObservabilityConfig = {
  serviceName: string;
  environment: string;
  serviceVersion: string;
  otlpEndpoint?: string;
  sentryDsn?: string;
};

let sdk: NodeSDK | undefined;
let started = false;

export function readObservabilityConfig(
  serviceName: string,
  environment = process.env.DEPLOYMENT_ENV ?? process.env.NODE_ENV ?? "development",
): ObservabilityConfig {
  const serviceVersion = process.env.SERVICE_VERSION ?? "development";
  const otlpEndpoint = cleanEndpoint(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
  const sentryDsn = cleanOptional(process.env.SENTRY_DSN);
  const deployedEnvironment = ["dev", "staging", "production"].includes(environment);
  if (deployedEnvironment && (!otlpEndpoint || !sentryDsn)) {
    throw new Error("Deployed environments require OTEL_EXPORTER_OTLP_ENDPOINT and SENTRY_DSN");
  }
  return {
    serviceName,
    environment,
    serviceVersion,
    ...(otlpEndpoint ? { otlpEndpoint } : {}),
    ...(sentryDsn ? { sentryDsn } : {}),
  };
}

export function startObservability(serviceName: string): ObservabilityConfig {
  const config = readObservabilityConfig(serviceName);
  if (started) return config;

  if (config.otlpEndpoint) {
    sdk = new NodeSDK({
      resource: defaultResource().merge(
        resourceFromAttributes({
          [ATTR_SERVICE_NAME]: config.serviceName,
          [ATTR_SERVICE_NAMESPACE]: "staybuddy",
          [ATTR_SERVICE_VERSION]: config.serviceVersion,
          [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
        }),
      ),
      traceExporter: new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` }),
      idGenerator: new AWSXRayIdGenerator(),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-dns": { enabled: false },
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
      ],
    });
    sdk.start();
  }

  if (config.sentryDsn) {
    Sentry.init({
      dsn: config.sentryDsn,
      environment: config.environment,
      release: config.serviceVersion,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      skipOpenTelemetrySetup: true,
      registerEsmLoaderHooks: false,
    });
  }

  started = true;
  return config;
}

export async function stopObservability(): Promise<void> {
  if (sdk) await sdk.shutdown();
  await Sentry.close(2_000);
  sdk = undefined;
  started = false;
}

export function captureException(error: unknown, contextData: Record<string, string> = {}): void {
  Sentry.withScope((scope) => {
    Object.entries(contextData).forEach(([key, value]) => scope.setTag(key, value));
    Sentry.captureException(error);
  });
}

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

export function withExtractedTrace<T>(
  source: Record<string, string | string[] | undefined>,
  action: () => T,
): T {
  return context.with(propagation.extract(context.active(), source), action);
}

function cleanEndpoint(value: string | undefined): string | undefined {
  const cleaned = cleanOptional(value);
  return cleaned?.replace(/\/+$/, "");
}

function cleanOptional(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}
