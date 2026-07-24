import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type Order, type Role } from '@prisma/client';
import { type Environment } from '../common/config/environment';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';

export interface ReservationExtensionRequest {
  readonly orderId: string;
  readonly expectedVersion: number;
  readonly actorUserId: string;
  readonly actorRole: Role;
  readonly reason: string;
  readonly correlationId?: string;
}

export interface ReservationExtensionRequestResult {
  readonly orderId: string;
  readonly publicNumber: string;
  readonly currentExpiresAt: string;
  readonly requestedExpiresAt: string;
  readonly requestId: string;
  readonly duplicate: boolean;
}

export interface ApplyReservationExtensionCommand {
  readonly orderId: string;
  readonly externalOrderId: string;
  readonly externalReservationId: string;
  readonly oneCVersion: number;
  readonly sourceVersion: string;
  readonly expiresAt: Date;
  readonly eventId?: string;
  readonly correlationId?: string;
  readonly comment?: string;
}

export interface ApplyReservationExtensionResult {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly oneCVersion: number;
  readonly reservationExpiresAt: string;
  readonly duplicate: boolean;
}

@Injectable()
export class ReservationExtensionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly outbox: OutboxService,
  ) {}

  request(command: ReservationExtensionRequest): Promise<ReservationExtensionRequestResult> {
    if (command.actorRole !== 'MANAGER' && command.actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'RESERVATION_EXTENSION_FORBIDDEN',
        message: 'Продление резерва доступно только сотруднику магазина.',
      });
    }
    if (!command.reason.trim()) {
      throw new UnprocessableEntityException({
        code: 'RESERVATION_EXTENSION_REASON_REQUIRED',
        message: 'Укажите причину продления резерва.',
      });
    }
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(tx, command.orderId);
        if (order.version !== command.expectedVersion) {
          throw new ConflictException({
            code: 'ORDER_VERSION_CONFLICT',
            message: 'Заказ уже изменён. Обновите данные и повторите действие.',
            details: { expectedVersion: command.expectedVersion, actualVersion: order.version },
          });
        }
        if (
          !['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'].includes(order.status) ||
          !order.oneCId ||
          order.oneCVersion === null ||
          !order.reservationExpiresAt ||
          order.reservationExpiresAt <= new Date()
        ) {
          throw new ConflictException({
            code: 'ACTIVE_RESERVATION_REQUIRED',
            message: 'Продлить можно только действующий резерв заказа, ожидающего оплату.',
          });
        }
        const active = await tx.stockReservation.findMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        });
        if (active.length === 0 || active.some((item) => item.expiresAt <= new Date())) {
          throw new ConflictException({
            code: 'ACTIVE_RESERVATION_REQUIRED',
            message: 'Активный резерв не найден или уже истёк.',
          });
        }
        const requestedExpiresAt = this.requestedExpiry(
          order.reservationExpiresAt,
          order.organizationData !== null,
          order.pickupLocationTimezone,
        );
        const idempotencyKey = `order.reservation-extension-requested:${order.id}:${order.version}:${requestedExpiresAt.toISOString()}`;
        const existing = await tx.outboxEvent.findUnique({ where: { idempotencyKey } });
        if (existing) {
          return {
            orderId: order.id,
            publicNumber: order.publicNumber,
            currentExpiresAt: order.reservationExpiresAt.toISOString(),
            requestedExpiresAt: requestedExpiresAt.toISOString(),
            requestId: existing.messageId,
            duplicate: true,
          };
        }
        const correlationId = command.correlationId ?? randomUUID();
        const event = await this.outbox.create(tx, {
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'order.reservation_extension.requested',
          idempotencyKey,
          correlationId,
          payload: {
            orderId: order.id,
            orderVersion: order.version,
            requestedExpiresAt: requestedExpiresAt.toISOString(),
            reason: command.reason.trim(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'RESERVATION_EXTENSION_REQUESTED',
            entityType: 'Order',
            entityId: order.id,
            source: 'ADMIN',
            actorUserId: command.actorUserId,
            actorRole: command.actorRole,
            reason: command.reason.trim(),
            correlationId,
            metadata: {
              previousExpiresAt: order.reservationExpiresAt.toISOString(),
              requestedExpiresAt: requestedExpiresAt.toISOString(),
              outboxMessageId: event.messageId,
              oneCVersion: order.oneCVersion,
            },
          },
        });
        return {
          orderId: order.id,
          publicNumber: order.publicNumber,
          currentExpiresAt: order.reservationExpiresAt.toISOString(),
          requestedExpiresAt: requestedExpiresAt.toISOString(),
          requestId: event.messageId,
          duplicate: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  applyFromOneC(
    command: ApplyReservationExtensionCommand,
  ): Promise<ApplyReservationExtensionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(tx, command.orderId);
        if (
          order.oneCId !== command.externalOrderId ||
          !['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'].includes(order.status)
        ) {
          throw new ConflictException({
            code: 'RESERVATION_EXTENSION_ORDER_MISMATCH',
            message: 'Подтверждение продления не соответствует активному заказу.',
          });
        }
        await tx.$queryRaw`
          SELECT id
          FROM stock_reservations
          WHERE order_id = ${order.id}::uuid
            AND status = 'ACTIVE'::"ReservationStatus"
          ORDER BY id
          FOR UPDATE
        `;
        const reservations = await tx.stockReservation.findMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          orderBy: { id: 'asc' },
        });
        if (
          reservations.length === 0 ||
          reservations.some(
            (reservation) => reservation.externalReservationId !== command.externalReservationId,
          )
        ) {
          throw new ConflictException({
            code: 'RESERVATION_EXTENSION_IDENTITY_MISMATCH',
            message: 'Идентификатор резерва 1С не совпадает.',
          });
        }
        if (
          order.oneCVersion === command.oneCVersion &&
          order.reservationExpiresAt?.getTime() === command.expiresAt.getTime() &&
          reservations.every(
            (reservation) => reservation.expiresAt.getTime() === command.expiresAt.getTime(),
          )
        ) {
          return {
            orderId: order.id,
            orderVersion: order.version,
            oneCVersion: command.oneCVersion,
            reservationExpiresAt: command.expiresAt.toISOString(),
            duplicate: true,
          };
        }
        if (
          order.oneCVersion === null ||
          command.oneCVersion <= order.oneCVersion ||
          !order.reservationExpiresAt ||
          command.expiresAt <= order.reservationExpiresAt ||
          command.expiresAt <= new Date()
        ) {
          throw new ConflictException({
            code: 'RESERVATION_EXTENSION_STALE_OR_INVALID',
            message: 'Получено устаревшее или некорректное продление резерва.',
          });
        }
        const correlationId = command.correlationId ?? randomUUID();
        await tx.stockReservation.updateMany({
          where: { orderId: order.id, status: 'ACTIVE' },
          data: {
            expiresAt: command.expiresAt,
            sourceVersion: command.sourceVersion,
            correlationId,
          },
        });
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            oneCVersion: command.oneCVersion,
            reservationExpiresAt: command.expiresAt,
            version: { increment: 1 },
          },
        });
        await this.outbox.create(tx, {
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'order.reservation_extended',
          idempotencyKey: `order.reservation-extended:${order.id}:${command.oneCVersion}`,
          correlationId,
          payload: {
            orderId: order.id,
            orderVersion: updated.version,
            reservationExpiresAt: command.expiresAt.toISOString(),
          },
          ...(command.eventId ? { causationId: command.eventId } : {}),
        });
        const reminderAt = new Date(
          Math.max(Date.now(), command.expiresAt.getTime() - 2 * 60 * 60 * 1_000),
        );
        await this.outbox.create(tx, {
          aggregateType: 'order',
          aggregateId: order.id,
          eventType: 'order.reservation_expiry_reminder',
          idempotencyKey: `order.reservation-reminder:${order.id}:${command.expiresAt.toISOString()}`,
          correlationId,
          availableAt: reminderAt,
          payload: {
            orderId: order.id,
            reservationExpiresAt: command.expiresAt.toISOString(),
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'RESERVATION_EXTENDED',
            entityType: 'Order',
            entityId: order.id,
            source: 'ONE_C',
            reason: command.comment,
            correlationId,
            metadata: {
              previousExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
              reservationExpiresAt: command.expiresAt.toISOString(),
              externalReservationId: command.externalReservationId,
              oneCVersion: command.oneCVersion,
            },
          },
        });
        return {
          orderId: order.id,
          orderVersion: updated.version,
          oneCVersion: command.oneCVersion,
          reservationExpiresAt: command.expiresAt.toISOString(),
          duplicate: false,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private requestedExpiry(current: Date, b2b: boolean, timezone: string): Date {
    if (!b2b) {
      return new Date(
        current.getTime() +
          this.config.get('DEFAULT_RESERVATION_HOURS', { infer: true }) * 3_600_000,
      );
    }
    let result = new Date(current);
    let remaining = this.config.get('B2B_RESERVATION_BUSINESS_DAYS', { infer: true });
    while (remaining > 0) {
      result = new Date(result.getTime() + 86_400_000);
      const weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        timeZone: timezone,
      }).format(result);
      if (weekday !== 'Sat' && weekday !== 'Sun') remaining -= 1;
    }
    return result;
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<Order> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден.',
      });
    }
    return order;
  }
}
