import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { SessionCookieService } from '../auth/session-cookie.service';

export interface RequestWithOptionalPrincipal {
  principal?: AuthenticatedPrincipal;
}

@Injectable()
export class OptionalSessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithOptionalPrincipal>();
    const rawToken = this.sessions.read(request as never);
    if (!rawToken) return true;
    try {
      request.principal = await this.auth.authenticateSession(rawToken);
    } catch (error: unknown) {
      if (!(error instanceof UnauthorizedException)) throw error;
      request.principal = undefined;
    }
    return true;
  }
}
