import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { AccountOrdersController } from './account-orders.controller';
import { AccountOrdersService } from './account-orders.service';
import { RepeatOrderService } from './repeat-order.service';

@Module({
  imports: [AuthModule, CartModule],
  controllers: [AccountOrdersController],
  providers: [AccountOrdersService, RepeatOrderService],
  exports: [AccountOrdersService],
})
export class AccountOrdersModule {}
