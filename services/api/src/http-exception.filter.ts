import type { ArgumentsHost } from "@nestjs/common";
import { Catch, HttpException, type ExceptionFilter } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { captureException, currentTraceId } from "@staybuddy/observability";
import { AppError } from "./errors.js";

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const traceId = currentTraceId() ?? reply.request.id ?? randomUUID();
    if (exception instanceof AppError) {
      void reply.status(exception.status).send({
        code: exception.code,
        traceId,
        retryable: exception.retryable,
        ...(exception.metadata ? { metadata: exception.metadata } : {}),
      });
      return;
    }
    if (exception instanceof HttpException) {
      void reply.status(exception.getStatus()).send({ code: "INVALID_REQUEST", traceId, retryable: false });
      return;
    }
    const databaseError = exception as {
      code?: string;
      detail?: string;
      routine?: string;
      stack?: string;
    };
    captureException(exception, { service: "staybuddy-api", traceId });
    console.error(
      JSON.stringify({
        level: "error",
        event: "api.unhandled",
        traceId,
        error: "INTERNAL_ERROR",
        ...(process.env.NODE_ENV !== "production" && exception instanceof Error
          ? {
              exceptionName: exception.name,
              exceptionMessage: exception.message,
              exceptionCode: databaseError.code,
              exceptionDetail: databaseError.detail,
              exceptionRoutine: databaseError.routine,
              exceptionStack: databaseError.stack,
            }
          : {}),
      }),
    );
    void reply.status(500).send({ code: "INTERNAL_ERROR", traceId, retryable: true });
  }
}
