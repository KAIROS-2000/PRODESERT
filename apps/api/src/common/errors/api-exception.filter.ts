import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type Request, type Response } from 'express';
import { type RequestWithContext } from '../request/request-context.middleware';
import { type JsonLogger } from '../logging/json-logger.service';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: JsonLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & Partial<RequestWithContext>>();
    const response = context.getResponse<Response>();
    const { status, body } = this.describe(exception);

    if (status >= 500) {
      this.logger.error('unhandled_http_exception', exception, {
        method: request.method,
        path: request.originalUrl.split('?')[0],
        correlationId: request.correlationId,
      });
    }

    response.status(status).json({
      ...body,
      correlationId: request.correlationId,
      timestamp: new Date().toISOString(),
    });
  }

  private describe(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return {
        status: HttpStatus.CONFLICT,
        body: { code: 'RESOURCE_CONFLICT', message: 'The resource conflicts with existing data.' },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { status, body: { code: this.defaultCode(status), message: response } };
      }
      if (isRecord(response)) {
        const messageValue = response.message;
        const message = typeof messageValue === 'string' ? messageValue : exception.message;
        return {
          status,
          body: {
            code: typeof response.code === 'string' ? response.code : this.defaultCode(status),
            message,
            ...(Array.isArray(messageValue) ? { details: messageValue } : {}),
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: 'INTERNAL_ERROR', message: 'The server could not process the request.' },
    };
  }

  private defaultCode(status: number): string {
    return HttpStatus[status] ?? 'HTTP_ERROR';
  }
}
