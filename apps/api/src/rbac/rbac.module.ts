import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacController } from './rbac.controller';

@Module({
  imports: [AuthModule],
  controllers: [RbacController],
})
export class RbacModule {}
