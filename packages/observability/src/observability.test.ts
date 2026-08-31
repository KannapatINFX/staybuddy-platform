import { describe, expect, it } from "vitest";
import { injectTraceHeaders, readObservabilityConfig, withExtractedTrace } from "./index.js";

describe("observability foundation", () => {
  it("supports trace propagation without replacing caller headers", () => {
    const headers = { "x-correlation-id": "synthetic-correlation" };
    expect(injectTraceHeaders(headers)).toBe(headers);
    expect(headers["x-correlation-id"]).toBe("synthetic-correlation");
  });

  it("normalizes runtime telemetry configuration", () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318/";
    process.env.SENTRY_DSN = "https://public@example.invalid/1";
    process.env.SERVICE_VERSION = "synthetic-sha";
    expect(readObservabilityConfig("staybuddy-api", "staging")).toEqual({
      serviceName: "staybuddy-api",
      environment: "staging",
      serviceVersion: "synthetic-sha",
      otlpEndpoint: "http://collector:4318",
      sentryDsn: "https://public@example.invalid/1",
    });
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.SENTRY_DSN;
    delete process.env.SERVICE_VERSION;
  });

  it("fails closed when deployed telemetry destinations are absent", () => {
    const previousOtlp = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const previousSentry = process.env.SENTRY_DSN;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.SENTRY_DSN;
    expect(() => readObservabilityConfig("staybuddy-worker", "dev")).toThrow(
      "Deployed environments require OTEL_EXPORTER_OTLP_ENDPOINT and SENTRY_DSN",
    );
    if (previousOtlp) process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousOtlp;
    if (previousSentry) process.env.SENTRY_DSN = previousSentry;
  });

  it("runs work inside an extracted propagation context", () => {
    expect(withExtractedTrace({ traceparent: undefined }, () => "processed")).toBe("processed");
  });
});
