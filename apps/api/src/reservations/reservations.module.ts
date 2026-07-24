import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOrderActionsController } from '../orders/admin-order-actions.controller';
import { OrderTransitionService } from '../orders/order-transition.service';
import { OutboxModule } from '../outbox/outbox.module';
import { ReservationExpiryProcessor } from './reservation-expiry.processor';
import { ReservationPolicyService } from './reservation-policy.service';
import { ReservationSweeperService } from './reservation-sweeper.service';
import { ReservationService } from './reservation.service';

@Module({
  imports: [AuthModule, OutboxModule],
  controllers: [AdminOrderActionsController],
  providers: [
    OrderTransitionService,
    ReservationPolicyService,
    ReservationService,
    ReservationExpiryProcessor,
    ReservationSweeperService,
  ],
  exports: [
    OrderTransitionService,
    ReservationPolicyService,
    ReservationService,
    ReservationExpiryProcessor,
    ReservationSweeperService,
  ],
})
export class ReservationsModule {}
