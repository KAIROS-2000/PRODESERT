import { Module } from '@nestjs/common';
import { AccountCoreModule } from '../account/account-core.module';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PasswordService } from '../common/security/password.service';
import { AuthNotificationPort } from './auth-notification.port';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { SessionCookieService } from './session-cookie.service';
import { SmtpAuthNotificationService } from './smtp-auth-notification.service';

@Module({
  imports: [AccountCoreModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    OpaqueTokenService,
    SessionCookieService,
    SessionAuthGuard,
    RolesGuard,
    SmtpAuthNotificationService,
    { provide: AuthNotificationPort, useExisting: SmtpAuthNotificationService },
  ],
  exports: [AuthService, SessionCookieService, SessionAuthGuard, RolesGuard],
})
export class AuthModule {}
