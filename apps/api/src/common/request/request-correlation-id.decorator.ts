import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedRequest } from '../../auth/auth.types';

export const RequestCorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().correlationId,
);
