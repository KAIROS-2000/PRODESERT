import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrderAccessTokenService } from './order-access-token.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, CartModule, OutboxModule],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService, OrdersService, OrderAccessTokenService],
  exports: [CheckoutService, OrdersService],
})
export class CheckoutModule {}
