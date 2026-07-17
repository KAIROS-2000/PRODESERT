import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type CookieOptions, type Request, type Response } from 'express';
import { type Environment } from '../config/environment';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class CsrfService {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.allowedOrigins = new Set(
      this.config.get('CORS_ORIGINS', { infer: true }).map((origin) => new URL(origin).origin),
    );
  }

  issue(request: Request, response: Response): string {
    const existing = this.readCookie(request);
    const token =
      existing && TOKEN_PATTERN.test(existing) ? existing : randomBytes(32).toString('base64url');
    response.cookie(this.cookieName, token, {
      ...this.cookieOptions(),
      maxAge: this.config.get('CSRF_TTL_SECONDS', { infer: true }) * 1_000,
    });
    response.setHeader('Cache-Control', 'no-store');
    return token;
  }

  assertTrustedRequest(request: Request): void {
    this.assertTrustedOrigin(request);

    const cookieToken = this.readCookie(request);
    const headerToken = request.header('x-csrf-token');
    if (
      !cookieToken ||
      !headerToken ||
      !TOKEN_PATTERN.test(cookieToken) ||
      !TOKEN_PATTERN.test(headerToken) ||
      !this.constantTimeEqual(cookieToken, headerToken)
    ) {
      throw new ForbiddenException({
        code: 'CSRF_TOKEN_INVALID',
        message: 'A valid CSRF token is required.',
      });
    }
  }

  private assertTrustedOrigin(request: Request): void {
    const originHeader = request.header('origin');
    const refererHeader = request.header('referer');
    const candidate = originHeader ?? refererHeader;

    if (!candidate) {
      throw this.invalidOrigin();
    }

    try {
      const origin = new URL(candidate).origin;
      if (!this.allowedOrigins.has(origin)) {
        throw this.invalidOrigin();
      }
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw this.invalidOrigin();
    }
  }

  private readCookie(request: Request): string | undefined {
    const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
    const value = cookies?.[this.cookieName];
    return typeof value === 'string' ? value : undefined;
  }

  private constantTimeEqual(left: string, right: string): boolean {
    const leftDigest = createHash('sha256').update(left, 'utf8').digest();
    const rightDigest = createHash('sha256').update(right, 'utf8').digest();
    return timingSafeEqual(leftDigest, rightDigest);
  }

  private invalidOrigin(): ForbiddenException {
    return new ForbiddenException({
      code: 'CSRF_ORIGIN_INVALID',
      message: 'The request origin is not allowed.',
    });
  }

  private get cookieName(): string {
    return this.config.get('CSRF_COOKIE_NAME', { infer: true });
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: false,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/api/v1',
    };
  }
}
