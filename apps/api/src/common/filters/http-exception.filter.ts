import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Shown when the database cannot be reached; the request is safe to retry. */
export const DATABASE_UNAVAILABLE_MESSAGE =
  'Lumorius is busy for a moment and could not reach its database. Please try again in a few seconds.';

/** Postgres SQLSTATEs that mean "cannot serve right now", not a bug in the request. */
const UNAVAILABLE_SQLSTATES = new Set(['53300', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006']);

/**
 * True only for Postgres/pg-pool failures. Generic network codes (ECONNRESET…) are
 * left alone because AI and integration calls raise them too.
 */
export function isDatabaseUnavailable(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  const code = (exception as { code?: unknown }).code;
  if (typeof code === 'string' && UNAVAILABLE_SQLSTATES.has(code)) return true;
  const message = exception.message.toLowerCase();
  return (
    message.includes('connection terminated due to connection timeout') ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('connection terminated unexpectedly')
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || message;
        errors = resp.errors;
      }
    } else if (isDatabaseUnavailable(exception)) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = DATABASE_UNAVAILABLE_MESSAGE;
      response.setHeader('Retry-After', '5');
      this.logger.warn(`Database unavailable on ${request.method} ${request.url}: ${(exception as Error).message}`);
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
