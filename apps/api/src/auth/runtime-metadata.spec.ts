import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { AuthNotificationPort } from './auth-notification.port';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/auth.dto';
import { SessionCookieService } from './session-cookie.service';
import { ClientFingerprintService } from '../common/security/client-fingerprint.service';
import { JsonLogger } from '../common/logging/json-logger.service';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PasswordService } from '../common/security/password.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Nest runtime metadata', () => {
  it('retains injectable constructor tokens', () => {
    expect(Reflect.getMetadata('design:paramtypes', AuthService)).toEqual([
      PrismaService,
      PasswordService,
      OpaqueTokenService,
      AuthNotificationPort,
      ConfigService,
      JsonLogger,
    ]);
    expect(Reflect.getMetadata('design:paramtypes', AuthController)).toEqual([
      AuthService,
      SessionCookieService,
      ClientFingerprintService,
      expect.any(Function),
    ]);
  });

  it('retains DTO metatypes used by the global ValidationPipe', () => {
    const parameterTypes = Reflect.getMetadata(
      'design:paramtypes',
      AuthController.prototype,
      'register',
    ) as unknown[];
    expect(parameterTypes[0]).toBe(RegisterDto);
  });
});
