import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type AuthenticatedPrincipal, type AuthenticatedRequest } from '../auth.types';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().principal,
);
