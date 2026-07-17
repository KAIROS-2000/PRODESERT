import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { type Observable, tap } from 'rxjs';
import { type RequestWithContext } from '../request/request-context.middleware';
import { JsonLogger } from './json-logger.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: JsonLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & Partial<RequestWithContext>>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap({
        finalize: () => {
          this.logger.log('http_request', {
            method: request.method,
            path: request.originalUrl.split('?')[0],
            statusCode: response.statusCode,
            durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
            correlationId: request.correlationId,
          });
        },
      }),
    );
  }
}
