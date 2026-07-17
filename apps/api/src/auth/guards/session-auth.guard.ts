import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { type AuthenticatedRequest } from '../auth.types';
import { SessionCookieService } from '../session-cookie.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.principal = await this.auth.authenticateSession(this.cookies.read(request));
    return true;
  }
}
