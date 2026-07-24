import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { FilesModule } from '../files/files.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { BankDetailsService } from './bank-details.service';
import { PaymentPolicyService } from './payment-policy.service';
import { PaymentService } from './payment.service';
import { PublicOrderPaymentAccessService } from './public-order-payment-access.service';
import { PublicPaymentsController } from './public-payments.controller';

@Module({
  imports: [AuthModule, CartModule, FilesModule, ReservationsModule],
  controllers: [PublicPaymentsController, AdminPaymentsController],
  providers: [
    BankDetailsService,
    PaymentPolicyService,
    PublicOrderPaymentAccessService,
    PaymentService,
  ],
  exports: [PaymentPolicyService, PaymentService],
})
export class PaymentsModule {}
