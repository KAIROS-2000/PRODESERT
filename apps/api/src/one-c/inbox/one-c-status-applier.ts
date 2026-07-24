import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReservationService } from '../../reservations/reservation.service';
import { IntegrationDispatchError } from '../../outbox/retry-policy';
import { type OneCOrderStatusPayloadDto } from '../dto/one-c-order-status.dto';

export const ONE_C_STATUS_APPLIER = Symbol('ONE_C_STATUS_APPLIER');

export interface OneCAcceptedOrderStatus {
  readonly syncJobId: string;
  readonly messageId: string;
  readonly correlationId: string;
  readonly sourceRevision: string;
  readonly payload: OneCOrderStatusPayloadDto;
}

/**
 * The processor depends on this port rather than on the reservation domain.
 * Later stages can replace it with a composite applier for payment/returns
 * without changing inbox persistence or transport security.
 */
export interface OneCStatusApplier {
  apply(command: OneCAcceptedOrderStatus): Promise<void>;
}

/**
 * Stage-4 application adapter: an ACTIVE/AWAITING_PAYMENT fact is mapped to
 * the reservation aggregate. No warehouse is accepted from an untrusted
 * status body; it is resolved from the order's configured pickup location.
 */
@Injectable()
export class ReservationOneCStatusApplier implements OneCStatusApplier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationService,
  ) {}

  async apply(command: OneCAcceptedOrderStatus): Promise<void> {
    const payload = command.payload;
    if (
      payload.status !== 'AWAITING_PAYMENT' ||
      payload.reservation?.status !== 'ACTIVE' ||
      !payload.reservation.expiresAt
    ) {
      throw new IntegrationDispatchError('ONE_C_STATUS_NOT_SUPPORTED_AT_STAGE_4', false);
    }

    const order = await this.prisma.order.findUnique({
      where: { oneCId: payload.externalOrderId },
      select: {
        id: true,
        oneCId: true,
        publicNumber: true,
        pickupLocationId: true,
      },
    });
    if (
      !order ||
      order.oneCId === null ||
      order.oneCId !== payload.externalOrderId ||
      order.publicNumber !== payload.publicNumber
    ) {
      throw new IntegrationDispatchError('ONE_C_ORDER_IDENTITY_MISMATCH', false);
    }

    const warehouses = await this.prisma.warehouse.findMany({
      where: { pickupLocationId: order.pickupLocationId, active: true },
      select: { oneCId: true },
      orderBy: { oneCId: 'asc' },
      take: 2,
    });
    const warehouse = warehouses[0];
    if (!warehouse || warehouses.length !== 1) {
      throw new IntegrationDispatchError(
        warehouses.length === 0
          ? 'ONE_C_PICKUP_WAREHOUSE_NOT_FOUND'
          : 'ONE_C_PICKUP_WAREHOUSE_AMBIGUOUS',
        false,
      );
    }

    const expiresAt = new Date(payload.reservation.expiresAt);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new IntegrationDispatchError('ONE_C_RESERVATION_EXPIRY_INVALID', false);
    }
    await this.reservations.confirmFromOneC({
      orderId: order.id,
      externalOrderId: payload.externalOrderId,
      orderVersion: payload.orderVersion,
      sourceVersion: command.sourceRevision,
      confirmedTotal: payload.confirmedTotal,
      currency: payload.currency,
      warehouseOneCId: warehouse.oneCId,
      externalReservationId: payload.reservation.externalReservationId,
      expiresAt,
      lines: payload.lines.map((line) => ({
        externalVariantId: line.externalVariantId,
        quantity: line.quantity,
        confirmedUnitPrice: line.confirmedUnitPrice,
        confirmedLineTotal: line.confirmedLineTotal,
        stockSourceVersion: line.stockSourceVersion,
      })),
      eventId: payload.eventId,
      correlationId: command.correlationId,
      ...(payload.comment ? { comment: payload.comment } : {}),
    });
  }
}
