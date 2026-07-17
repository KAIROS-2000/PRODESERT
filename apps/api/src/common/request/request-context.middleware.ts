import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';

export interface RequestWithContext extends Request {
  correlationId: string;
}

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const candidate = request.header('x-correlation-id');
    request.correlationId =
      candidate && SAFE_CORRELATION_ID.test(candidate) ? candidate : randomUUID();
    response.setHeader('x-correlation-id', request.correlationId);
    next();
  }
}
