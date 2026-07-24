import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Order, type OrderStatus, type Role, type StatusSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOrderTransitionAllowed, InvalidOrderTransitionError } from './order-state-machine';

export interface OrderTransitionCommand {
  orderId: string;
  toStatus: OrderStatus;
  source: StatusSource;
  expectedVersion?: number;
  actorUserId?: string;
  actorRole?: Role;
  reason?: string;
  correlationId?: string;
  metadata?: Prisma.InputJsonObject;
  occurredAt?: Date;
}

@Injectable()
export class OrderTransitionService {
  constructor(private readonly prisma: PrismaService) {}

  transition(command: OrderTransitionCommand): Promise<Order> {
    return this.prisma.$transaction((tx) => this.transitionInTransaction(tx, command), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  async transitionInTransaction(
    tx: Prisma.TransactionClient,
    command: OrderTransitionCommand,
  ): Promise<Order> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${command.orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: command.orderId } });
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Заказ не найден.',
      });
    }
    if (command.expectedVersion !== undefined && order.version !== command.expectedVersion) {
      throw new ConflictException({
        code: 'ORDER_VERSION_CONFLICT',
        message: 'Заказ уже изменён. Обновите данные и повторите действие.',
        details: { expectedVersion: command.expectedVersion, actualVersion: order.version },
      });
    }

    try {
      assertOrderTransitionAllowed(order.status, command.toStatus, command.source);
    } catch (error: unknown) {
      if (!(error instanceof InvalidOrderTransitionError)) throw error;
      throw new ConflictException({
        code: 'ORDER_TRANSITION_NOT_ALLOWED',
        message: 'Переход заказа в запрошенный статус недоступен.',
        details: {
          fromStatus: error.from,
          toStatus: error.to,
          source: error.source,
        },
      });
    }

    const occurredAt = command.occurredAt ?? new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: command.toStatus,
        version: { increment: 1 },
        ...this.statusTimestamps(command.toStatus, occurredAt),
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: command.toStatus,
        source: command.source,
        ...(command.actorUserId ? { actorUserId: command.actorUserId } : {}),
        ...(command.reason ? { reason: command.reason } : {}),
        ...(command.correlationId ? { correlationId: command.correlationId } : {}),
        ...(command.metadata ? { metadata: command.metadata } : {}),
        createdAt: occurredAt,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'ORDER_STATUS_CHANGED',
        entityType: 'Order',
        entityId: order.id,
        source: command.source,
        ...(command.actorUserId ? { actorUserId: command.actorUserId } : {}),
        ...(command.actorRole ? { actorRole: command.actorRole } : {}),
        ...(command.reason ? { reason: command.reason } : {}),
        ...(command.correlationId ? { correlationId: command.correlationId } : {}),
        metadata: {
          fromStatus: order.status,
          toStatus: command.toStatus,
          previousVersion: order.version,
          version: updated.version,
          ...(command.metadata ?? {}),
        },
      },
    });
    return updated;
  }

  private statusTimestamps(
    status: OrderStatus,
    occurredAt: Date,
  ): Pick<Order, 'paidAt' | 'readyForPickupAt' | 'completedAt' | 'cancelledAt'> | object {
    if (status === 'PAID') return { paidAt: occurredAt };
    if (status === 'READY_FOR_PICKUP') return { readyForPickupAt: occurredAt };
    if (status === 'COMPLETED') return { completedAt: occurredAt };
    if (status === 'CANCELLED_BY_CUSTOMER' || status === 'CANCELLED_BY_STORE') {
      return { cancelledAt: occurredAt };
    }
    return {};
  }
}
