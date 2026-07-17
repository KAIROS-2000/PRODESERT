import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { ClientFingerprintService } from '../common/security/client-fingerprint.service';
import { CsrfService } from '../common/security/csrf.service';
import { AuthService } from './auth.service';
import {
  type AuthenticatedPrincipal,
  type AuthenticatedRequest,
  type PublicSession,
} from './auth.types';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import {
  EmailOnlyDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionCookieService } from './session-cookie.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
    private readonly fingerprints: ClientFingerprintService,
    private readonly csrf: CsrfService,
  ) {}

  @Get('csrf')
  csrfToken(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { csrfToken: string } {
    return { csrfToken: this.csrf.issue(request, response) };
  }

  @Post('register')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<{ message: string }> {
    return this.auth.register(dto, this.fingerprints.fromRequest(request));
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request): Promise<{ message: string }> {
    return this.auth.verifyEmail(dto, this.fingerprints.fromRequest(request));
  }

  @Post('resend-verification')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  resend(@Body() dto: EmailOnlyDto, @Req() request: Request): Promise<{ message: string }> {
    return this.auth.resendVerification(dto, this.fingerprints.fromRequest(request));
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicSession> {
    const result = await this.auth.login(dto, this.fingerprints.fromRequest(request));
    this.cookies.set(response, result.rawToken);
    return this.auth.toPublicSession(result.principal);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookies.read(request), this.fingerprints.fromRequest(request));
    this.cookies.clear(response);
  }

  @Post('logout-all')
  @HttpCode(204)
  @UseGuards(SessionAuthGuard)
  async logoutAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logoutAll(principal, this.fingerprints.fromRequest(request));
    this.cookies.clear(response);
  }

  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  forgot(@Body() dto: EmailOnlyDto, @Req() request: Request): Promise<{ message: string }> {
    return this.auth.forgotPassword(dto, this.fingerprints.fromRequest(request));
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  reset(@Body() dto: ResetPasswordDto, @Req() request: Request): Promise<{ message: string }> {
    return this.auth.resetPassword(dto, this.fingerprints.fromRequest(request));
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  session(@CurrentPrincipal() principal: AuthenticatedPrincipal): PublicSession {
    return this.auth.toPublicSession(principal);
  }
}
