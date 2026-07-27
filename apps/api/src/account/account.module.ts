import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccountCoreModule } from './account-core.module';
import { AccountController } from './account.controller';

@Module({
  imports: [AuthModule, AccountCoreModule],
  controllers: [AccountController],
  exports: [AccountCoreModule],
})
export class AccountModule {}
