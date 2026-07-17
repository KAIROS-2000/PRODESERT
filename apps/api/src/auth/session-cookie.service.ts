import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { type Environment } from '../common/config/environment';

@Injectable()
export class SessionCookieService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  read(request: Request): string | undefined {
    const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
    const value = cookies?.[this.name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  set(response: Response, rawToken: string): void {
    response.cookie(this.name, rawToken, {
      ...this.baseOptions(),
      maxAge: this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1_000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.name, this.baseOptions());
  }

  private get name(): string {
    return this.config.get('COOKIE_NAME', { infer: true });
  }

  private baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/',
    };
  }
}
