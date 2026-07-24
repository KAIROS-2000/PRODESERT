import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { EmailTransportService } from './email-transport.service';
import { OrderEmailRenderer } from './order-email-renderer';
import { OrderNotificationService } from './order-notification.service';

@Module({
  imports: [CheckoutModule],
  providers: [EmailTransportService, OrderEmailRenderer, OrderNotificationService],
  exports: [OrderNotificationService],
})
export class NotificationModule {}
