import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  type Order,
  type OrderStatus,
  type ReservationStatus,
  type Role,
  type StatusSource,
  type StockReservation,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderTransitionService } from '../orders/order-transition.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  ReservationPolicyError,
  ReservationPolicyService,
  type StockConfirmationCommand,
} from './reservation-policy.service';

export interface StockConfirmationRequest {
  orderId: string;
  expectedVersion: number;
  actorUserId: string;
  actorRole: Role;
  reason?: string;
  correlationId?: string;
}

export interface StockConfirmationRequestResult {
  orderId: string;
  publicNumber: string;
  orderStatus: OrderStatus;
  orderVersion: number;
  requestId: string;
  queuedAt: string;
  duplicate: boolean;
}

export interface StockConfirmationResult {
  orderId: string;
  publicNumber: string;
  status: OrderStatus;
  orderVersion: number;
  oneCVersion: number;
  reservationExpiresAt: string;
  reservations: number;
  duplicate: boolean;
}

export interface ReleaseReservationCommand {
  orderId: string;
  reason: string;
  source: StatusSource;
  actorUserId?: string;
  actorRole?: Role;
  correlationId?: string;
  now?: Date;
}

export interface ReleaseReservationResult {
  orderId: string;
  status: OrderStatus;
  reservationsReleased: number;
  duplicate: boolean;
}

@Injectable()
export class ReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: ReservationPolicyService,
    private readonly transitions: OrderTransitionService,
    private readonly outbox: OutboxService,
  ) {}

  requestStockConfirmation(
    command: StockConfirmationRequest,
  ): Promise<StockConfirmationRequestResult> {
    if (command.actorRole !== 'MANAGER' && command.actorRole !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'STOCK_CONFIRMATION_FORBIDDEN',
        message: 'Запрос подтверждения наличия доступен только сотруднику магазина.',
      });
    }
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const order = await this.lockOrder(tx, command.orderId);
          if (order.version !== command.expectedVersion) {
            throw this.versionConflict(command.expectedVersion, order.version);
          }
          if (order.status !== 'AWAITING_STOCK_CONFIRMATION') {
            throw new ConflictException({
              code: 'ORDER_NOT_AWAITING_STOCK',
              message: 'Заказ уже не ожидает подтверждения наличия.',
              details: { status: order.status },
            });
          }
          if (!order.oneCId) {
            throw new ConflictException({
              code: 'ORDER_NOT_EXPORTED_TO_ONE_C',
              message: 'Сначала дождитесь экспорта заказа в 1С.',
            });
          }

          const idempotencyKey = `order.stock-confirmation-requested:${order.id}:${order.version}`;
          const existing = await tx.outboxEvent.findUnique({ where: { idempotencyKey } });
          if (existing) {
            return {
              orderId: order.id,
              publicNumber: order.publicNumber,
              orderStatus: order.status,
              orderVersion: order.version,
              requestId: existing.messageId,
              queuedAt: existing.createdAt.toISOString(),
              duplicate: true,
            };
          }

          const correlationId = command.correlationId ?? randomUUID();
          const payload = {
            orderId: order.id,
            orderVersion: order.version,
          } satisfies Prisma.InputJsonObject;
          const event = await this.outbox.create(tx, {
            aggregateType: 'order',
            aggregateId: order.id,
            eventType: 'order.stock_confirmation.requested',
            idempotencyKey,
            correlationId,
            payload,
          });
          await tx.auditLog.create({
            data: {
              action: 'ORDER_STOCK_CONFIRMATION_REQUESTED',
              entityType: 'Order',
              entityId: order.id,
              source: 'ADMIN',
              actorUserId: command.actorUserId,
              actorRole: command.actorRole,
              ...(command.reason ? { reason: command.reason } : {}),
              correlationId,
              metadata: {
                orderStatus: order.status,
                orderVersion: order.version,
                outboxMessageId: event.messageId,
              },
            },
          });
          return {
            orderId: order.id,
            publicNumber: order.publicNumber,
            orderStatus: order.status,
            orderVersion: order.version,
            requestId: event.messageId,
            queuedAt: event.createdAt.toISOString(),
            duplicate: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  confirmFromOneC(command: StockConfirmationCommand): Promise<StockConfirmationResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const order = await this.lockOrder(tx, command.orderId);
          const correlationId = command.correlationId ?? randomUUID();
          const items = await tx.orderItem.findMany({
            where: { orderId: order.id },
            orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
          });
          const previousReservations = await tx.stockReservation.findMany({
            where: { orderId: order.id },
            orderBy: [{ variantId: 'asc' }, { orderItemId: 'asc' }],
          });
          const warehouse = await tx.warehouse.findUnique({
            where: { oneCId: command.warehouseOneCId },
          });
          if (!warehouse) {
            throw new UnprocessableEntityException({
              code: 'WAREHOUSE_MISMATCH',
              message: 'Склад из подтверждения 1С не найден.',
            });
          }

          if (order.oneCVersion !== null && command.orderVersion <= order.oneCVersion) {
            if (
              command.orderVersion === order.oneCVersion &&
              this.isDuplicateConfirmation(
                order,
                items,
                previousReservations,
                warehouse.id,
                command,
              )
            ) {
              return {
                orderId: order.id,
                publicNumber: order.publicNumber,
                status: order.status,
                orderVersion: order.version,
                oneCVersion: order.oneCVersion,
                reservationExpiresAt: command.expiresAt.toISOString(),
                reservations: previousReservations.length,
                duplicate: true,
              };
            }
            throw new ConflictException({
              code:
                command.orderVersion < order.oneCVersion
                  ? 'ONE_C_VERSION_STALE'
                  : 'ONE_C_VERSION_CONFLICT',
              message:
                command.orderVersion < order.oneCVersion
                  ? 'Получена устаревшая версия заказа 1С.'
                  : 'Эта версия заказа 1С уже применена с другими данными.',
              details: {
                currentVersion: order.oneCVersion,
                receivedVersion: command.orderVersion,
              },
            });
          }

          const variantIds = items.flatMap((item) => (item.variantId ? [item.variantId] : []));
          await this.lockBalances(tx, warehouse.id, variantIds);
          await this.lockActiveReservations(tx, order.id);
          const [balances, activeReservations] = await Promise.all([
            tx.stockBalance.findMany({
              where: { warehouseId: warehouse.id, variantId: { in: variantIds } },
              orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
            }),
            tx.stockReservation.findMany({
              where: { orderId: order.id, status: 'ACTIVE' },
              orderBy: [{ variantId: 'asc' }, { orderItemId: 'asc' }],
            }),
          ]);
          if (activeReservations.length > 0) {
            throw new ConflictException({
              code: 'ACTIVE_RESERVATION_ALREADY_EXISTS',
              message: 'Для заказа уже существует активный резерв.',
            });
          }

          try {
            this.policy.assertCanConfirm(
              { order, items, warehouse, balances },
              command,
              new Date(),
            );
          } catch (error: unknown) {
            if (!(error instanceof ReservationPolicyError)) throw error;
            throw new UnprocessableEntityException({
              code: error.code,
              message: error.message,
              ...(error.details ? { details: error.details } : {}),
            });
          }

          const confirmedAt = new Date();
          for (const item of items) {
            const variantId = item.variantId;
            if (!variantId) {
              throw new UnprocessableEntityException({
                code: 'LINES_MISMATCH',
                message: 'Строка заказа больше не связана с вариантом товара.',
              });
            }
            const balance = balances.find((candidate) => candidate.variantId === variantId);
            if (!balance) {
              throw new UnprocessableEntityException({
                code: 'STOCK_BALANCE_MISSING',
                message: 'Остаток для строки заказа не найден.',
              });
            }
            await tx.stockBalance.update({
              where: { id: balance.id },
              data: {
                available: { decrement: item.quantity },
                reserved: { increment: item.quantity },
              },
            });
            await tx.stockReservation.create({
              data: {
                orderId: order.id,
                orderItemId: item.id,
                variantId,
                warehouseId: warehouse.id,
                quantity: item.quantity,
                status: 'ACTIVE',
                externalReservationId: command.externalReservationId,
                sourceVersion: command.sourceVersion,
                expiresAt: command.expiresAt,
                confirmedAt,
                source: 'ONE_C',
                correlationId,
              },
            });
          }

          const transitioned = await this.transitions.transitionInTransaction(tx, {
            orderId: order.id,
            toStatus: 'AWAITING_PAYMENT',
            source: 'ONE_C',
            expectedVersion: order.version,
            ...(command.comment ? { reason: command.comment } : {}),
            correlationId,
            metadata: {
              eventId: command.eventId ?? null,
              externalOrderId: command.externalOrderId,
              externalReservationId: command.externalReservationId,
              oneCVersion: command.orderVersion,
              reservationExpiresAt: command.expiresAt.toISOString(),
            },
            occurredAt: confirmedAt,
          });
          const updated = await tx.order.update({
            where: { id: order.id },
            data: {
              oneCId: command.externalOrderId,
              oneCVersion: command.orderVersion,
              stockConfirmedAt: confirmedAt,
              reservationExpiresAt: command.expiresAt,
            },
          });

          await this.outbox.create(tx, {
            aggregateType: 'order',
            aggregateId: order.id,
            eventType: 'order.stock_confirmed',
            idempotencyKey: `order.stock-confirmed:${order.id}:${command.orderVersion}`,
            correlationId,
            payload: {
              orderId: order.id,
              orderVersion: updated.version,
            },
            ...(command.eventId ? { causationId: command.eventId } : {}),
          });
          await this.outbox.create(tx, {
            aggregateType: 'order',
            aggregateId: order.id,
            eventType: 'order.reservation_expiry_reminder',
            idempotencyKey: `order.reservation-reminder:${order.id}:${command.expiresAt.toISOString()}`,
            correlationId,
            availableAt: new Date(
              Math.max(Date.now(), command.expiresAt.getTime() - 2 * 60 * 60 * 1_000),
            ),
            payload: {
              orderId: order.id,
              reservationExpiresAt: command.expiresAt.toISOString(),
            },
          });
          await tx.auditLog.create({
            data: {
              action: 'STOCK_RESERVATION_CONFIRMED',
              entityType: 'Order',
              entityId: order.id,
              source: 'ONE_C',
              correlationId,
              metadata: {
                eventId: command.eventId ?? null,
                externalOrderId: command.externalOrderId,
                externalReservationId: command.externalReservationId,
                oneCVersion: command.orderVersion,
                reservationCount: items.length,
                reservationExpiresAt: command.expiresAt.toISOString(),
              },
            },
          });
          return {
            orderId: order.id,
            publicNumber: order.publicNumber,
            status: transitioned.status,
            orderVersion: updated.version,
            oneCVersion: command.orderVersion,
            reservationExpiresAt: command.expiresAt.toISOString(),
            reservations: items.length,
            duplicate: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  release(command: ReleaseReservationCommand): Promise<ReleaseReservationResult> {
    return this.releaseOrExpire(command, false);
  }

  expire(
    orderId: string,
    now = new Date(),
    correlationId?: string,
  ): Promise<ReleaseReservationResult> {
    return this.releaseOrExpire(
      {
        orderId,
        reason: 'Срок резерва истёк.',
        source: 'SYSTEM',
        ...(correlationId ? { correlationId } : {}),
        now,
      },
      true,
    );
  }

  private releaseOrExpire(
    command: ReleaseReservationCommand,
    expire: boolean,
  ): Promise<ReleaseReservationResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const order = await this.lockOrder(tx, command.orderId);
          const candidates = await tx.stockReservation.findMany({
            where: { orderId: order.id, status: 'ACTIVE' },
            orderBy: [{ variantId: 'asc' }, { warehouseId: 'asc' }, { orderItemId: 'asc' }],
          });
          if (candidates.length === 0) {
            return {
              orderId: order.id,
              status: order.status,
              reservationsReleased: 0,
              duplicate: true,
            };
          }
          const now = command.now ?? new Date();
          const correlationId = command.correlationId ?? randomUUID();
          if (
            expire &&
            (!order.reservationExpiresAt || order.reservationExpiresAt.getTime() > now.getTime())
          ) {
            return {
              orderId: order.id,
              status: order.status,
              reservationsReleased: 0,
              duplicate: true,
            };
          }
          if (
            expire &&
            order.status !== 'AWAITING_PAYMENT' &&
            order.status !== 'PAYMENT_VERIFICATION'
          ) {
            throw new ConflictException({
              code: 'RESERVATION_EXPIRY_NOT_ALLOWED',
              message: 'Резерв нельзя истечь в текущем статусе заказа.',
              details: { status: order.status },
            });
          }

          await this.lockReservationBalances(tx, candidates);
          await this.lockActiveReservations(tx, order.id);
          const activeReservations = await tx.stockReservation.findMany({
            where: { orderId: order.id, status: 'ACTIVE' },
            orderBy: [{ variantId: 'asc' }, { warehouseId: 'asc' }, { orderItemId: 'asc' }],
          });
          for (const reservation of activeReservations) {
            const changed = await tx.stockBalance.updateMany({
              where: {
                variantId: reservation.variantId,
                warehouseId: reservation.warehouseId,
                reserved: { gte: reservation.quantity },
              },
              data: {
                reserved: { decrement: reservation.quantity },
                available: { increment: reservation.quantity },
              },
            });
            if (changed.count !== 1) {
              throw new ConflictException({
                code: 'STOCK_PROJECTION_INVALID',
                message: 'Проекция складского резерва повреждена; освобождение остановлено.',
              });
            }
            await tx.stockReservation.update({
              where: { id: reservation.id },
              data: {
                status: expire ? 'EXPIRED' : 'RELEASED',
                releasedAt: now,
                releaseReason: command.reason,
                source: command.source,
                correlationId,
              },
            });
          }

          let status = order.status;
          let version = order.version;
          if (expire) {
            const transitioned = await this.transitions.transitionInTransaction(tx, {
              orderId: order.id,
              toStatus: 'RESERVATION_EXPIRED',
              source: 'SYSTEM',
              expectedVersion: order.version,
              reason: command.reason,
              correlationId,
              metadata: { reservationsReleased: activeReservations.length },
              occurredAt: now,
            });
            status = transitioned.status;
            version = transitioned.version;
            await this.outbox.create(tx, {
              aggregateType: 'order',
              aggregateId: order.id,
              eventType: 'order.reservation_expired',
              idempotencyKey: `order.reservation-expired:${order.id}:${order.version}`,
              correlationId,
              payload: {
                orderId: order.id,
                orderVersion: version,
              },
            });
          }
          await tx.auditLog.create({
            data: {
              action: expire ? 'STOCK_RESERVATION_EXPIRED' : 'STOCK_RESERVATION_RELEASED',
              entityType: 'Order',
              entityId: order.id,
              source: command.source,
              ...(command.actorUserId ? { actorUserId: command.actorUserId } : {}),
              ...(command.actorRole ? { actorRole: command.actorRole } : {}),
              reason: command.reason,
              correlationId,
              metadata: {
                reservationCount: activeReservations.length,
                orderVersion: version,
              },
            },
          });
          return {
            orderId: order.id,
            status,
            reservationsReleased: activeReservations.length,
            duplicate: false,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
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

  private async lockBalances(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    variantIds: readonly string[],
  ): Promise<void> {
    if (variantIds.length === 0) return;
    const ids = Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`));
    await tx.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM stock_balances
        WHERE warehouse_id = ${warehouseId}::uuid
          AND variant_id IN (${ids})
        ORDER BY variant_id, warehouse_id
        FOR UPDATE
      `,
    );
  }

  private async lockReservationBalances(
    tx: Prisma.TransactionClient,
    reservations: readonly StockReservation[],
  ): Promise<void> {
    const keys = [...reservations]
      .sort((left, right) =>
        `${left.variantId}:${left.warehouseId}`.localeCompare(
          `${right.variantId}:${right.warehouseId}`,
        ),
      )
      .map(
        (reservation) =>
          Prisma.sql`(variant_id = ${reservation.variantId}::uuid AND warehouse_id = ${reservation.warehouseId}::uuid)`,
      );
    if (keys.length === 0) return;
    await tx.$queryRaw(
      Prisma.sql`
        SELECT id
        FROM stock_balances
        WHERE ${Prisma.join(keys, ' OR ')}
        ORDER BY variant_id, warehouse_id
        FOR UPDATE
      `,
    );
  }

  private async lockActiveReservations(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id
      FROM stock_reservations
      WHERE order_id = ${orderId}::uuid
        AND status = 'ACTIVE'::"ReservationStatus"
      ORDER BY variant_id, warehouse_id, order_item_id
      FOR UPDATE
    `;
  }

  private isDuplicateConfirmation(
    order: {
      oneCId: string | null;
      oneCVersion: number | null;
      reservationExpiresAt: Date | null;
      grandTotal: Prisma.Decimal;
      currency: string;
    },
    items: readonly {
      id: string;
      variantId: string | null;
      oneCVariantId: string;
      quantity: Prisma.Decimal;
      unitPrice: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
    }[],
    reservations: readonly StockReservation[],
    warehouseId: string,
    command: StockConfirmationCommand,
  ): boolean {
    if (
      order.oneCId !== command.externalOrderId ||
      order.oneCVersion !== command.orderVersion ||
      order.reservationExpiresAt?.getTime() !== command.expiresAt.getTime() ||
      order.currency !== command.currency ||
      !this.decimalEquals(command.confirmedTotal, order.grandTotal) ||
      command.lines.length !== items.length ||
      reservations.length !== items.length
    ) {
      return false;
    }
    const linesByExternalVariant = new Map(
      command.lines.map((line) => [line.externalVariantId, line]),
    );
    if (linesByExternalVariant.size !== command.lines.length) return false;
    const reservationByItem = new Map(reservations.map((item) => [item.orderItemId, item]));
    return items.every((item) => {
      const reservation = reservationByItem.get(item.id);
      const line = linesByExternalVariant.get(item.oneCVariantId);
      return Boolean(
        reservation &&
        line &&
        item.variantId &&
        reservation.variantId === item.variantId &&
        reservation.warehouseId === warehouseId &&
        reservation.quantity.equals(item.quantity) &&
        reservation.externalReservationId === command.externalReservationId &&
        reservation.sourceVersion === command.sourceVersion &&
        reservation.expiresAt.getTime() === command.expiresAt.getTime() &&
        this.decimalEquals(line.quantity, item.quantity) &&
        this.decimalEquals(line.confirmedUnitPrice, item.unitPrice) &&
        this.decimalEquals(line.confirmedLineTotal, item.lineTotal) &&
        this.isAppliedReservationStatus(reservation.status),
      );
    });
  }

  private decimalEquals(value: string, expected: Prisma.Decimal): boolean {
    try {
      return new Prisma.Decimal(value).equals(expected);
    } catch {
      return false;
    }
  }

  private isAppliedReservationStatus(status: ReservationStatus): boolean {
    return (
      status === 'ACTIVE' || status === 'RELEASED' || status === 'EXPIRED' || status === 'CONSUMED'
    );
  }

  private versionConflict(expectedVersion: number, actualVersion: number): ConflictException {
    return new ConflictException({
      code: 'ORDER_VERSION_CONFLICT',
      message: 'Заказ уже изменён. Обновите данные и повторите действие.',
      details: { expectedVersion, actualVersion },
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }
}
