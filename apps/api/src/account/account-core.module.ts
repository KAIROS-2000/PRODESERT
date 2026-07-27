import { Module } from '@nestjs/common';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PasswordService } from '../common/security/password.service';
import { AccountEmailService } from './account-email.service';
import { AccountService } from './account.service';

@Module({
  providers: [AccountService, AccountEmailService, OpaqueTokenService, PasswordService],
  exports: [AccountService],
})
export class AccountCoreModule {}
