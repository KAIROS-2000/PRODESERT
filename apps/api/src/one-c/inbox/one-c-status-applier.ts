import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentService } from '../../payments/payment.service';
import { ReservationExtensionService } from '../../reservations/reservation-extension.service';
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
    private readonly extensions: ReservationExtensionService,
    private readonly payments: PaymentService,
  ) {}

  async apply(command: OneCAcceptedOrderStatus): Promise<void> {
    const payload = command.payload;
    const order = await this.prisma.order.findUnique({
      where: { oneCId: payload.externalOrderId },
      select: {
        id: true,
        oneCId: true,
        oneCVersion: true,
        publicNumber: true,
        pickupLocationId: true,
        status: true,
        currency: true,
        grandTotal: true,
        reservationExpiresAt: true,
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
    if (
      payload.status === 'PAID' &&
      payload.payment?.status === 'CONFIRMED' &&
      payload.payment.confirmedAt &&
      payload.payment.externalPaymentId
    ) {
      await this.assertCommercialSnapshot(order.id, payload);
      await this.payments.confirmFromOneC({
        orderId: order.id,
        oneCVersion: payload.orderVersion,
        externalPaymentId: payload.payment.externalPaymentId,
        confirmedAt: new Date(payload.payment.confirmedAt),
        confirmedTotal: payload.confirmedTotal,
        currency: payload.currency,
        correlationId: command.correlationId,
        eventId: payload.eventId,
        ...(payload.comment ? { comment: payload.comment } : {}),
      });
      return;
    }
    if (
      payload.status !== 'AWAITING_PAYMENT' ||
      payload.reservation?.status !== 'ACTIVE' ||
      !payload.reservation.expiresAt
    ) {
      throw new IntegrationDispatchError('ONE_C_STATUS_NOT_SUPPORTED', false);
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
    const activeReservations = await this.prisma.stockReservation.findMany({
      where: { orderId: order.id, status: 'ACTIVE' },
      select: { externalReservationId: true },
    });
    if (activeReservations.length > 0) {
      await this.assertCommercialSnapshot(order.id, payload);
      if (
        !['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'].includes(order.status) ||
        !order.reservationExpiresAt ||
        expiresAt <= order.reservationExpiresAt ||
        activeReservations.some(
          (reservation) =>
            reservation.externalReservationId !== payload.reservation?.externalReservationId,
        )
      ) {
        throw new IntegrationDispatchError('ONE_C_RESERVATION_EXTENSION_INVALID', false);
      }
      await this.extensions.applyFromOneC({
        orderId: order.id,
        externalOrderId: payload.externalOrderId,
        externalReservationId: payload.reservation.externalReservationId,
        oneCVersion: payload.orderVersion,
        sourceVersion: command.sourceRevision,
        expiresAt,
        eventId: payload.eventId,
        correlationId: command.correlationId,
        ...(payload.comment ? { comment: payload.comment } : {}),
      });
      return;
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

  private async assertCommercialSnapshot(
    orderId: string,
    payload: OneCOrderStatusPayloadDto,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (
      !order ||
      payload.currency !== order.currency ||
      !new Prisma.Decimal(payload.confirmedTotal).equals(order.grandTotal) ||
      payload.lines.length !== order.items.length
    ) {
      throw new IntegrationDispatchError('ONE_C_COMMERCIAL_SNAPSHOT_MISMATCH', false);
    }
    const lines = new Map(payload.lines.map((line) => [line.externalVariantId, line]));
    const matches = order.items.every((item) => {
      const line = lines.get(item.oneCVariantId);
      return Boolean(
        line &&
        new Prisma.Decimal(line.quantity).equals(item.quantity) &&
        new Prisma.Decimal(line.confirmedUnitPrice).equals(item.unitPrice) &&
        new Prisma.Decimal(line.confirmedLineTotal).equals(item.lineTotal),
      );
    });
    if (!matches) {
      throw new IntegrationDispatchError('ONE_C_COMMERCIAL_SNAPSHOT_MISMATCH', false);
    }
  }
}
