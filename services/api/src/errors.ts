export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly retryable = false,
    readonly metadata?: Record<string, string | number | boolean>,
  ) {
    super(code);
    this.name = "AppError";
  }
}
