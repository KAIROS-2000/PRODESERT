import { ForbiddenException } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';
import { type Request, type Response } from 'express';
import { type Environment } from '../config/environment';
import { CsrfService } from './csrf.service';

function configService(): ConfigService<Environment, true> {
  const values: Record<string, unknown> = {
    CORS_ORIGINS: ['https://shop.example.test', 'https://admin.example.test'],
    COOKIE_SECURE: true,
    CSRF_COOKIE_NAME: 'pd_csrf',
    CSRF_TTL_SECONDS: 7_200,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Environment, true>;
}

function requestWith(options: { cookie?: string; header?: string; origin?: string }): Request {
  const headers: Record<string, string | undefined> = {
    origin: options.origin,
    'x-csrf-token': options.header,
  };
  return {
    cookies: options.cookie ? { pd_csrf: options.cookie } : {},
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('CsrfService', () => {
  const service = new CsrfService(configService());

  it('issues a reusable token in a readable secure cookie', () => {
    const cookie = jest.fn();
    const setHeader = jest.fn();
    const response = { cookie, setHeader } as unknown as Response;

    const token = service.issue(requestWith({}), response);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie).toHaveBeenCalledWith(
      'pd_csrf',
      token,
      expect.objectContaining({ httpOnly: false, secure: true, sameSite: 'lax', path: '/api/v1' }),
    );
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('accepts matching cookie/header only from an allowlisted origin', () => {
    const token = 'A'.repeat(43);
    expect(() =>
      service.assertTrustedRequest(
        requestWith({ cookie: token, header: token, origin: 'https://shop.example.test' }),
      ),
    ).not.toThrow();
  });

  it.each([
    [
      'foreign origin',
      { cookie: 'A'.repeat(43), header: 'A'.repeat(43), origin: 'https://evil.test' },
    ],
    [
      'mismatched token',
      { cookie: 'A'.repeat(43), header: 'B'.repeat(43), origin: 'https://shop.example.test' },
    ],
    ['missing origin', { cookie: 'A'.repeat(43), header: 'A'.repeat(43) }],
  ])('rejects %s', (_name, options) => {
    expect(() => service.assertTrustedRequest(requestWith(options))).toThrow(ForbiddenException);
  });
});
