import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AccountNotificationPreferences,
  AccountOrganization,
  AccountProfile,
  AccountSession,
  BulkSessionRevocationResult,
  SessionRevocationResult,
} from '@pro-dessert/contracts';
import { type Response } from 'express';
import { type AuthenticatedPrincipal, type AuthenticatedRequest } from '../auth/auth.types';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { SessionCookieService } from '../auth/session-cookie.service';
import { ClientFingerprintService } from '../common/security/client-fingerprint.service';
import { AccountService } from './account.service';
import {
  ConfirmEmailChangeDto,
  ChangePasswordDto,
  CreateOrganizationDto,
  DeleteOrganizationDto,
  RequestEmailChangeDto,
  UpdateAccountProfileDto,
  UpdateNotificationPreferencesDto,
  UpdateOrganizationDto,
} from './dto/account.dto';

@Controller('account')
@UseGuards(SessionAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly fingerprints: ClientFingerprintService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Get('profile')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  profile(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<AccountProfile> {
    return this.account.getProfile(principal.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateAccountProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountProfile> {
    return this.account.updateProfile(principal, dto, this.fingerprints.fromRequest(request));
  }

  @Post('profile/email-change')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  requestEmailChange(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: RequestEmailChangeDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.account.requestEmailChange(principal, dto, this.fingerprints.fromRequest(request));
  }

  @Post('profile/email-change/confirm')
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  confirmEmailChange(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: ConfirmEmailChangeDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountProfile> {
    return this.account.confirmEmailChange(
      principal,
      dto.token,
      this.fingerprints.fromRequest(request),
    );
  }

  @Post('profile/password')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.account.changePassword(principal, dto, this.fingerprints.fromRequest(request));
  }

  @Get('organizations')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  organizations(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<AccountOrganization[]> {
    return this.account.listOrganizations(principal.userId);
  }

  @Post('organizations')
  createOrganization(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: CreateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountOrganization> {
    return this.account.createOrganization(principal, dto, this.fingerprints.fromRequest(request));
  }

  @Patch('organizations/:organizationId')
  updateOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateOrganizationDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountOrganization> {
    return this.account.updateOrganization(
      principal,
      organizationId,
      dto,
      this.fingerprints.fromRequest(request),
    );
  }

  @Delete('organizations/:organizationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Query() query: DeleteOrganizationDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    return this.account.deleteOrganization(
      principal,
      organizationId,
      query.expectedVersion,
      this.fingerprints.fromRequest(request),
    );
  }

  @Get('notification-preferences')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  notificationPreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<AccountNotificationPreferences> {
    return this.account.getNotificationPreferences(principal.userId);
  }

  @Patch('notification-preferences')
  updateNotificationPreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() dto: UpdateNotificationPreferencesDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AccountNotificationPreferences> {
    return this.account.updateNotificationPreferences(
      principal,
      dto,
      this.fingerprints.fromRequest(request),
    );
  }

  @Get('sessions')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  sessions(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<AccountSession[]> {
    return this.account.listSessions(principal);
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionRevocationResult> {
    const result = await this.account.revokeSession(
      principal,
      sessionId,
      this.fingerprints.fromRequest(request),
    );
    if (result.currentSessionRevoked) this.cookies.clear(response);
    return result;
  }

  @Delete('sessions')
  revokeOtherSessions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<BulkSessionRevocationResult> {
    return this.account.revokeOtherSessions(principal, this.fingerprints.fromRequest(request));
  }
}
