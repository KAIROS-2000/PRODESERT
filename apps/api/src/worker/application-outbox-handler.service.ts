import { Inject, Injectable } from '@nestjs/common';
import { type OutboxEvent } from '@prisma/client';
import { type OutboxEventHandler } from '../outbox/outbox-handler';
import { IntegrationDispatchError } from '../outbox/retry-policy';
import { ONE_C_OUTBOX_HANDLER, OneCCommandService } from '../one-c/one-c-command.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class ApplicationOutboxHandler implements OutboxEventHandler {
  constructor(
    @Inject(ONE_C_OUTBOX_HANDLER) private readonly oneC: OneCCommandService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    if (this.oneC.supports(event.eventType)) {
      await this.oneC.handle(event);
      return;
    }
    if (event.eventType === 'order.stock_confirmed') {
      await this.scheduleReservationExpiry(event);
      return;
    }
    throw new IntegrationDispatchError('OUTBOX_EVENT_UNSUPPORTED', false);
  }

  private async scheduleReservationExpiry(event: OutboxEvent): Promise<void> {
    if (
      event.aggregateType !== 'order' ||
      typeof event.payload !== 'object' ||
      event.payload === null ||
      Array.isArray(event.payload) ||
      event.payload.orderId !== event.aggregateId
    ) {
      throw new IntegrationDispatchError('RESERVATION_EXPIRY_CLAIM_INVALID', false);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: event.aggregateId },
      select: { reservationExpiresAt: true },
    });
    if (!order) {
      throw new IntegrationDispatchError('RESERVATION_EXPIRY_ORDER_NOT_FOUND', false);
    }
    if (!order.reservationExpiresAt) {
      throw new IntegrationDispatchError('RESERVATION_EXPIRY_DEADLINE_MISSING', false);
    }
    try {
      await this.queue.enqueueReservationExpiry(
        event.aggregateId,
        order.reservationExpiresAt,
        event.correlationId,
      );
    } catch {
      throw new IntegrationDispatchError('RESERVATION_QUEUE_UNAVAILABLE', true);
    }
  }
}
