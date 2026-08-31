import "./instrumentation.js";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { currentTraceId } from "@staybuddy/observability";
import { randomUUID } from "node:crypto";
import { AppModule } from "./app.module.js";
import { SafeHttpExceptionFilter } from "./http-exception.filter.js";

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== "test" }),
  );
  app.setGlobalPrefix("v1");
  const allowedOrigins = (
    process.env.ADMIN_ORIGINS ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "http://localhost:3000,http://localhost:3001,http://localhost:3002")
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: false });
  app.useGlobalPipes(new ValidationPipe({ transform: false, whitelist: false }));
  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (request, reply) => {
      const incomingCorrelationId = request.headers["x-correlation-id"];
      const correlationId =
        typeof incomingCorrelationId === "string" && incomingCorrelationId.length <= 128
          ? incomingCorrelationId
          : randomUUID();
      request.headers["x-correlation-id"] = correlationId;
      reply.header("x-correlation-id", correlationId);
      reply.header("x-trace-id", currentTraceId() ?? request.id);
    });
  const swagger = new DocumentBuilder().setTitle("StayBuddy API").setVersion("0.1.0").build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));
  await app.init();
  return app;
}

if (process.env.NODE_ENV !== "test") {
  const app = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
}
