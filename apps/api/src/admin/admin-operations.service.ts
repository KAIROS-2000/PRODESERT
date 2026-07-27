import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OutboxStatus,
  Prisma,
  ReservationStatus,
  SyncDirection,
  SyncJobStatus,
  type OrderStatus,
} from '@prisma/client';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { allowedOrderTransitions } from '../orders/order-state-machine';
import { OrderTransitionService } from '../orders/order-transition.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  type AddInternalNoteDto,
  type AdminAuditQueryDto,
  type AdminOrdersQueryDto,
  type AdminPaymentsQueryDto,
  type AdminReservationsQueryDto,
  type AdminSyncJobsQueryDto,
  type CancelOrderDto,
  type ExpectedOrderVersionDto,
  type RetryDto,
} from './dto/admin.dto';

const orderInclude = {
  customer: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  items: { orderBy: { createdAt: 'asc' as const } },
  payment: {
    include: {
      verifiedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      documents: {
        select: {
          id: true,
          kind: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          storageStatus: true,
          scanStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  stockReservations: {
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      variant: { select: { id: true, sku: true, offerName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  statusHistory: {
    include: {
      actor: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  internalNotes: {
    include: {
      author: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.OrderInclude;

type AdminOrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

const adminOrderListInclude = {
  customer: {
    select: { id: true, email: true, firstName: true, lastName: true, phone: true },
  },
  payment: { select: { id: true, status: true, amount: true, version: true, proofSubmittedAt: true } },
  _count: { select: { items: true, stockReservations: true, internalNotes: true } },
} satisfies Prisma.OrderInclude;

type AdminOrderListRecord = Prisma.OrderGetPayload<{ include: typeof adminOrderListInclude }>;

const paymentListInclude = {
  order: {
    select: {
      id: true,
      publicNumber: true,
      status: true,
      version: true,
      guestEmail: true,
      guestName: true,
      guestSurname: true,
      reservationExpiresAt: true,
    },
  },
  documents: {
    select: {
      id: true,
      kind: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      storageStatus: true,
      scanStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
  verifiedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
} satisfies Prisma.PaymentInclude;

type PaymentListRecord = Prisma.PaymentGetPayload<{ include: typeof paymentListInclude }>;

export function adminAllowedActions(
  status: OrderStatus,
  paymentStatus: string | null,
): Record<string, boolean> {
  const targets = new Set(allowedOrderTransitions(status, 'ADMIN'));
  return {
    confirmStock: status === 'AWAITING_STOCK_CONFIRMATION',
    sendPaymentDetails: status === 'AWAITING_PAYMENT' && paymentStatus === null,
    confirmPayment:
      status === 'PAYMENT_VERIFICATION' &&
      ['PENDING', 'PROOF_UPLOADED', 'VERIFYING', 'REJECTED'].includes(paymentStatus ?? ''),
    rejectPayment:
      status === 'PAYMENT_VERIFICATION' && ['PROOF_UPLOADED', 'VERIFYING'].includes(paymentStatus ?? ''),
    extendReservation: ['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'].includes(status),
    startAssembly: targets.has('ASSEMBLING'),
    markReady: targets.has('READY_FOR_PICKUP'),
    complete: targets.has('COMPLETED'),
    cancel: targets.has('CANCELLED_BY_STORE'),
    addNote: true,
  };
}

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
  ) {}

  async dashboard(from?: string, to?: string): Promise<Record<string, unknown>> {
    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getTime() - 30 * 86_400_000);
    const periodEnd = to ? new Date(to) : now;
    const expiringAt = new Date(now.getTime() + 4 * 3_600_000);
    const period = { gte: periodStart, lte: periodEnd };
    const awaitingPayment = ['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'] as OrderStatus[];
    const [
      newOrders,
      awaitingStock,
      awaitingPaymentCount,
      verification,
      assembling,
      readyForPickup,
      expiringReservations,
      integrationErrors,
      stockDiscrepancies,
      orderTotals,
      createdInPeriod,
      paidInPeriod,
      latestSuccess,
      latestAttempt,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: period } }),
      this.prisma.order.count({ where: { status: 'AWAITING_STOCK_CONFIRMATION' } }),
      this.prisma.order.count({ where: { status: { in: awaitingPayment } } }),
      this.prisma.order.count({ where: { status: 'PAYMENT_VERIFICATION' } }),
      this.prisma.order.count({ where: { status: 'ASSEMBLING' } }),
      this.prisma.order.count({ where: { status: 'READY_FOR_PICKUP' } }),
      this.prisma.order.count({
        where: {
          status: { in: awaitingPayment },
          reservationExpiresAt: { gt: now, lte: expiringAt },
        },
      }),
      this.prisma.syncError.count({ where: { resolvedAt: null } }),
      this.prisma.syncError.count({
        where: {
          resolvedAt: null,
          OR: [
            { code: { contains: 'STOCK', mode: 'insensitive' } },
            { code: { contains: 'INVENTORY', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.order.aggregate({ where: { createdAt: period }, _sum: { grandTotal: true } }),
      this.prisma.order.count({ where: { createdAt: period } }),
      this.prisma.order.count({ where: { paidAt: period } }),
      this.prisma.syncJob.findFirst({
        where: { status: SyncJobStatus.APPLIED },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true, eventType: true, correlationId: true },
      }),
      this.prisma.syncJob.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { updatedAt: true, eventType: true, status: true, correlationId: true },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
      metrics: {
        newOrders,
        awaitingStock,
        awaitingPayment: awaitingPaymentCount,
        paymentVerification: verification,
        assembling,
        readyForPickup,
        expiringReservations,
        integrationErrors,
        stockDiscrepancies,
        orderTotal: orderTotals._sum.grandTotal?.toFixed(2) ?? '0.00',
        conversionOrdersToPayment:
          createdInPeriod === 0 ? 0 : Number(((paidInPeriod / createdInPeriod) * 100).toFixed(2)),
      },
      integration: {
        lastSuccessful: latestSuccess
          ? {
              at: latestSuccess.processedAt?.toISOString() ?? null,
              eventType: latestSuccess.eventType,
              correlationId: latestSuccess.correlationId,
            }
          : null,
        lastAttempt: latestAttempt
          ? {
              at: latestAttempt.updatedAt.toISOString(),
              eventType: latestAttempt.eventType,
              status: latestAttempt.status,
              correlationId: latestAttempt.correlationId,
            }
          : null,
      },
    };
  }

  async orders(query: AdminOrdersQueryDto): Promise<Record<string, unknown>> {
    const where = this.orderWhere(query);
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: adminOrderListInclude,
        orderBy: this.orderBy(query),
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(rows.map((row) => this.toOrderSummary(row)), query.page, query.limit, total);
  }

  async ordersCsv(query: AdminOrdersQueryDto): Promise<string> {
    const rows = await this.prisma.order.findMany({
      where: this.orderWhere(query),
      include: adminOrderListInclude,
      orderBy: this.orderBy(query),
      take: 10_000,
    });
    const header = [
      'Номер',
      'Статус',
      'Клиент',
      'Email',
      'Сумма',
      'Оплата',
      'Резерв до',
      'Создан',
    ];
    const lines = rows.map((row) => [
      row.publicNumber,
      row.status,
      this.customerName(row),
      row.guestEmail,
      row.grandTotal.toFixed(2),
      row.payment?.status ?? '',
      row.reservationExpiresAt?.toISOString() ?? '',
      row.createdAt.toISOString(),
    ]);
    return [header, ...lines].map((line) => line.map(this.csvValue).join(';')).join('\n');
  }

  async order(id: string): Promise<Record<string, unknown>> {
    const record = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!record) throw this.orderNotFound();
    return this.toOrderDetail(record);
  }

  async transition(
    id: string,
    target: Extract<OrderStatus, 'ASSEMBLING' | 'READY_FOR_PICKUP' | 'COMPLETED'>,
    dto: ExpectedOrderVersionDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.transitions.transition({
      orderId: id,
      toStatus: target,
      source: 'ADMIN',
      expectedVersion: dto.expectedVersion,
      actorUserId: principal.userId,
      actorRole: principal.role,
      correlationId,
    });
    return { id: order.id, publicNumber: order.publicNumber, status: order.status, version: order.version };
  }

  async cancel(
    id: string,
    dto: CancelOrderDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.transitions.transition({
      orderId: id,
      toStatus: 'CANCELLED_BY_STORE',
      source: 'ADMIN',
      expectedVersion: dto.expectedVersion,
      actorUserId: principal.userId,
      actorRole: principal.role,
      reason: dto.reason.trim(),
      correlationId,
    });
    return { id: order.id, publicNumber: order.publicNumber, status: order.status, version: order.version };
  }

  async addNote(
    orderId: string,
    dto: AddInternalNoteDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const body = dto.body.trim();
    const note = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (!order) throw this.orderNotFound();
      const created = await transaction.orderInternalNote.create({
        data: { orderId, authorUserId: principal.userId, body },
        include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });
      await transaction.auditLog.create({
        data: {
          action: 'ORDER_INTERNAL_NOTE_ADDED',
          entityType: 'Order',
          entityId: orderId,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          correlationId,
          metadata: { noteId: created.id },
        },
      });
      return created;
    });
    return {
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      author: this.staff(note.author),
    };
  }

  async payments(query: AdminPaymentsQueryDto): Promise<Record<string, unknown>> {
    const q = query.q?.trim();
    const where: Prisma.PaymentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { order: { publicNumber: { contains: q, mode: 'insensitive' } } },
              { order: { guestEmail: { contains: q, mode: 'insensitive' } } },
              { paymentReference: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: paymentListInclude,
        orderBy: [{ proofSubmittedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(rows.map((row) => this.toPayment(row)), query.page, query.limit, total);
  }

  async payment(id: string): Promise<Record<string, unknown>> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentListInclude,
    });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Платёж не найден.' });
    }
    return this.toPayment(payment);
  }

  async recordPaymentDocumentDownload(
    documentId: string,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action: 'PAYMENT_DOCUMENT_DOWNLOADED',
        entityType: 'PaymentDocument',
        entityId: documentId,
        source: 'ADMIN',
        actorUserId: principal.userId,
        actorRole: principal.role,
        correlationId,
      },
    });
  }

  async reservations(query: AdminReservationsQueryDto): Promise<Record<string, unknown>> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 4 * 3_600_000);
    const where: Prisma.StockReservationWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.expiringOnly
        ? { status: ReservationStatus.ACTIVE, expiresAt: { gt: now, lte: horizon } }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.stockReservation.count({ where }),
      this.prisma.stockReservation.findMany({
        where,
        include: {
          order: { select: { id: true, publicNumber: true, status: true, version: true } },
          orderItem: { select: { id: true, productName: true, sku: true, quantity: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
        orderBy: { expiresAt: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(
      rows.map((row) => ({
        id: row.id,
        status: row.status,
        quantity: row.quantity.toFixed(),
        externalReservationId: row.externalReservationId,
        expiresAt: row.expiresAt.toISOString(),
        sourceVersion: row.sourceVersion,
        order: row.order,
        item: {
          id: row.orderItem.id,
          productName: row.orderItem.productName,
          sku: row.orderItem.sku,
          quantity: row.orderItem.quantity.toFixed(),
        },
        warehouse: row.warehouse,
      })),
      query.page,
      query.limit,
      total,
    );
  }

  async integrationOverview(): Promise<Record<string, unknown>> {
    const [
      lastSuccess,
      lastAttempt,
      importedProducts,
      updatedPrices,
      updatedStock,
      unresolvedErrors,
      commercialDiscrepancies,
      stockDiscrepancies,
      syncDlq,
      outboxDlq,
    ] = await Promise.all([
      this.prisma.syncJob.findFirst({
        where: { status: SyncJobStatus.APPLIED },
        orderBy: { processedAt: 'desc' },
      }),
      this.prisma.syncJob.findFirst({ orderBy: { updatedAt: 'desc' } }),
      this.countAppliedEvents('product'),
      this.countAppliedEvents('price'),
      this.countAppliedEvents('stock'),
      this.prisma.syncError.count({ where: { resolvedAt: null } }),
      this.prisma.syncError.count({
        where: {
          resolvedAt: null,
          code: { contains: 'MISMATCH', mode: 'insensitive' },
          NOT: {
            OR: [
              { code: { contains: 'STOCK', mode: 'insensitive' } },
              { code: { contains: 'INVENTORY', mode: 'insensitive' } },
            ],
          },
        },
      }),
      this.prisma.syncError.count({
        where: {
          resolvedAt: null,
          OR: [
            { code: { contains: 'STOCK', mode: 'insensitive' } },
            { code: { contains: 'INVENTORY', mode: 'insensitive' } },
          ],
        },
      }),
      this.prisma.syncJob.count({ where: { status: SyncJobStatus.DLQ } }),
      this.prisma.outboxEvent.count({ where: { status: OutboxStatus.DLQ } }),
    ]);
    return {
      lastSuccessful: lastSuccess ? this.toSyncJob(lastSuccess) : null,
      lastAttempt: lastAttempt ? this.toSyncJob(lastAttempt) : null,
      counters: {
        importedProducts,
        updatedPrices,
        updatedStock,
        unresolvedErrors,
        totalDiscrepancies: commercialDiscrepancies + stockDiscrepancies,
        commercialDiscrepancies,
        stockDiscrepancies,
        dlq: syncDlq + outboxDlq,
      },
    };
  }

  async syncJobs(query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    const where: Prisma.SyncJobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: { contains: query.eventType.trim(), mode: 'insensitive' } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.syncJob.count({ where }),
      this.prisma.syncJob.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(rows.map((row) => this.toSyncJob(row)), query.page, query.limit, total);
  }

  async syncErrors(query: AdminSyncJobsQueryDto, discrepanciesOnly = false): Promise<Record<string, unknown>> {
    const where: Prisma.SyncErrorWhereInput = {
      ...(discrepanciesOnly ? { code: { contains: 'MISMATCH', mode: 'insensitive' } } : {}),
      syncJob: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.eventType
          ? { eventType: { contains: query.eventType.trim(), mode: 'insensitive' } }
          : {}),
      },
    };
    const [total, rows] = await Promise.all([
      this.prisma.syncError.count({ where }),
      this.prisma.syncError.findMany({
        where,
        include: {
          syncJob: {
            select: {
              id: true,
              direction: true,
              eventType: true,
              messageId: true,
              externalEventId: true,
              internalEntityId: true,
              externalEntityId: true,
              correlationId: true,
              status: true,
            },
          },
        },
        orderBy: { occurredAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(
      rows.map((row) => ({
        id: row.id,
        severity: row.severity,
        code: row.code,
        message: row.sanitizedMessage,
        entityType: row.entityType,
        externalEntityId: row.externalEntityId,
        retryable: row.retryable,
        occurredAt: row.occurredAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolution: row.resolution,
        syncJob: row.syncJob,
      })),
      query.page,
      query.limit,
      total,
    );
  }

  async dlq(query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    const [syncJobs, outboxEvents] = await Promise.all([
      this.prisma.syncJob.findMany({
        where: { status: SyncJobStatus.DLQ },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      }),
      this.prisma.outboxEvent.findMany({
        where: { status: OutboxStatus.DLQ },
        select: {
          id: true,
          messageId: true,
          aggregateType: true,
          aggregateId: true,
          eventType: true,
          correlationId: true,
          attempts: true,
          lastErrorCode: true,
          lastErrorMessage: true,
          deadLetteredAt: true,
          createdAt: true,
        },
        orderBy: { deadLetteredAt: 'desc' },
        take: 100,
      }),
    ]);
    const eventTypeFilter = query.eventType?.toLowerCase();
    const filteredJobs = eventTypeFilter
      ? syncJobs.filter((job) => job.eventType.toLowerCase().includes(eventTypeFilter))
      : syncJobs;
    return {
      items: [
        ...filteredJobs.map((job) => ({ kind: 'SYNC_JOB', ...this.toSyncJob(job) })),
        ...outboxEvents.map((event) => ({
          kind: 'OUTBOX_EVENT',
          id: event.id,
          messageId: event.messageId,
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId,
          eventType: event.eventType,
          correlationId: event.correlationId,
          attempts: event.attempts,
          lastErrorCode: event.lastErrorCode,
          lastErrorMessage: event.lastErrorMessage,
          deadLetteredAt: event.deadLetteredAt?.toISOString() ?? null,
          createdAt: event.createdAt.toISOString(),
        })),
      ],
    };
  }

  async retrySyncJob(
    id: string,
    dto: RetryDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const reason = dto.reason.trim();
    const result = await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.syncJob.findUnique({ where: { id } });
      if (!job) throw new NotFoundException({ code: 'SYNC_JOB_NOT_FOUND', message: 'Задача не найдена.' });
      if (
        job.direction !== SyncDirection.INBOUND ||
        (job.status !== SyncJobStatus.DLQ && job.status !== SyncJobStatus.RETRY_SCHEDULED)
      ) {
        throw new ConflictException({
          code: 'SYNC_JOB_RETRY_NOT_ALLOWED',
          message: 'Эту задачу нельзя безопасно повторить вручную.',
        });
      }
      const now = new Date();
      const updated = await transaction.syncJob.update({
        where: { id },
        data: {
          status: SyncJobStatus.QUEUED,
          availableAt: now,
          nextRetryAt: null,
          processedAt: null,
          processingStartedAt: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'INTEGRATION_SYNC_JOB_REQUEUED',
          entityType: 'SyncJob',
          entityId: id,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          reason,
          correlationId,
          metadata: { priorStatus: job.status, messageId: job.messageId },
        },
      });
      return updated;
    });
    return { id: result.id, messageId: result.messageId, status: result.status };
  }

  async retryOutboxEvent(
    id: string,
    dto: RetryDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const reason = dto.reason.trim();
    const result = await this.prisma.$transaction(async (transaction) => {
      const event = await transaction.outboxEvent.findUnique({ where: { id } });
      if (!event) throw new NotFoundException({ code: 'OUTBOX_EVENT_NOT_FOUND', message: 'Событие не найдено.' });
      if (event.status !== OutboxStatus.DLQ) {
        throw new ConflictException({
          code: 'OUTBOX_RETRY_NOT_ALLOWED',
          message: 'Повторно поставить в очередь можно только событие из DLQ.',
        });
      }
      const updated = await transaction.outboxEvent.update({
        where: { id },
        data: {
          status: OutboxStatus.PENDING,
          availableAt: new Date(),
          processingStartedAt: null,
          processingOwner: null,
          deadLetteredAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          lastErrorAt: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          action: 'INTEGRATION_OUTBOX_REQUEUED',
          entityType: 'OutboxEvent',
          entityId: id,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          reason,
          correlationId,
          metadata: { messageId: event.messageId, eventType: event.eventType },
        },
      });
      return updated;
    });
    return { id: result.id, messageId: result.messageId, status: result.status };
  }

  async audit(query: AdminAuditQueryDto): Promise<Record<string, unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { contains: query.action.trim(), mode: 'insensitive' } } : {}),
      ...(query.entityType
        ? { entityType: { contains: query.entityType.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.correlationId ? { correlationId: query.correlationId.trim() } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        source: row.source,
        reason: row.reason,
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        actor: this.staff(row.actor),
        metadata: this.redactMetadata(row.metadata),
      })),
      query.page,
      query.limit,
      total,
    );
  }

  private orderWhere(query: AdminOrdersQueryDto): Prisma.OrderWhereInput {
    const q = query.q?.trim();
    const createdAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentStatus ? { payment: { is: { status: query.paymentStatus } } } : {}),
      ...(query.from || query.to ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { publicNumber: { contains: q, mode: 'insensitive' } },
              { guestEmail: { contains: q, mode: 'insensitive' } },
              { guestPhone: { contains: q, mode: 'insensitive' } },
              { guestName: { contains: q, mode: 'insensitive' } },
              { guestSurname: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private orderBy(query: AdminOrdersQueryDto): Prisma.OrderOrderByWithRelationInput {
    if (query.sort === 'grandTotal') return { grandTotal: query.direction };
    if (query.sort === 'status') return { status: query.direction };
    return { createdAt: query.direction };
  }

  private toOrderSummary(record: AdminOrderListRecord): Record<string, unknown> {
    return {
      id: record.id,
      publicNumber: record.publicNumber,
      status: record.status,
      version: record.version,
      customer: {
        id: record.customer?.id ?? null,
        name: this.customerName(record),
        email: record.guestEmail,
        phone: record.guestPhone,
      },
      grandTotal: record.grandTotal.toFixed(2),
      currency: record.currency,
      payment: record.payment
        ? {
            id: record.payment.id,
            status: record.payment.status,
            amount: record.payment.amount.toFixed(2),
            version: record.payment.version,
            proofSubmittedAt: record.payment.proofSubmittedAt?.toISOString() ?? null,
          }
        : null,
      reservationExpiresAt: record.reservationExpiresAt?.toISOString() ?? null,
      pickupLocation: {
        code: record.pickupLocationCode,
        name: record.pickupLocationName,
        address: record.pickupLocationAddress,
      },
      counts: record._count,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toOrderDetail(record: AdminOrderRecord): Record<string, unknown> {
    return {
      ...this.toOrderSummary({
        ...record,
        _count: {
          items: record.items.length,
          stockReservations: record.stockReservations.length,
          internalNotes: record.internalNotes.length,
        },
      }),
      customer: {
        id: record.customer?.id ?? null,
        name: this.customerName(record),
        email: record.guestEmail,
        phone: record.guestPhone,
        organizationData: record.organizationData,
      },
      customerComment: record.customerComment,
      internalComment: record.internalComment,
      desiredPickupAt: record.desiredPickupAt?.toISOString() ?? null,
      pickupLocation: {
        code: record.pickupLocationCode,
        name: record.pickupLocationName,
        address: record.pickupLocationAddress,
        timezone: record.pickupLocationTimezone,
        phone: record.pickupLocationPhone,
        openingHours: record.pickupLocationOpeningHours,
      },
      items: record.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        brandName: item.brandName,
        offerName: item.offerName,
        packDescription: item.packDescription,
        unit: item.unit,
        quantity: item.quantity.toFixed(),
        unitPrice: item.unitPrice.toFixed(2),
        oldUnitPrice: item.oldUnitPrice?.toFixed(2) ?? null,
        unitDiscount: item.unitDiscount.toFixed(2),
        vatRate: item.vatRate.toFixed(2),
        lineSubtotal: item.lineSubtotal.toFixed(2),
        lineDiscount: item.lineDiscount.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
      })),
      payment: record.payment
        ? this.toPayment({
            ...record.payment,
            order: {
              id: record.id,
              publicNumber: record.publicNumber,
              status: record.status,
              version: record.version,
              guestEmail: record.guestEmail,
              guestName: record.guestName,
              guestSurname: record.guestSurname,
              reservationExpiresAt: record.reservationExpiresAt,
            },
          })
        : null,
      reservations: record.stockReservations.map((reservation) => ({
        id: reservation.id,
        status: reservation.status,
        quantity: reservation.quantity.toFixed(),
        externalReservationId: reservation.externalReservationId,
        expiresAt: reservation.expiresAt.toISOString(),
        sourceVersion: reservation.sourceVersion,
        warehouse: reservation.warehouse,
        variant: reservation.variant,
      })),
      timeline: record.statusHistory.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        source: event.source,
        reason: event.reason,
        correlationId: event.correlationId,
        createdAt: event.createdAt.toISOString(),
        actor: this.staff(event.actor),
      })),
      internalNotes: record.internalNotes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: note.createdAt.toISOString(),
        author: this.staff(note.author),
      })),
      allowedActions: adminAllowedActions(record.status, record.payment?.status ?? null),
    };
  }

  private toPayment(record: PaymentListRecord): Record<string, unknown> {
    return {
      id: record.id,
      status: record.status,
      version: record.version,
      amount: record.amount.toFixed(2),
      currency: record.currency,
      bankDetails: {
        recipientName: record.recipientName,
        recipientInn: record.recipientInn,
        recipientKpp: record.recipientKpp,
        settlementAccount: record.settlementAccount,
        correspondentAccount: record.correspondentAccount,
        bik: record.bik,
        bankName: record.bankName,
        paymentPurpose: record.paymentPurpose,
        detailsVersion: record.detailsVersion,
        isDemo: record.isDemo,
      },
      paymentReference: record.paymentReference,
      customerComment: record.customerComment,
      rejectionComment: record.rejectionComment,
      detailsPublishedAt: record.detailsPublishedAt.toISOString(),
      proofSubmittedAt: record.proofSubmittedAt?.toISOString() ?? null,
      verificationStartedAt: record.verificationStartedAt?.toISOString() ?? null,
      confirmedAt: record.confirmedAt?.toISOString() ?? null,
      rejectedAt: record.rejectedAt?.toISOString() ?? null,
      verifiedBy: this.staff(record.verifiedBy),
      order: {
        id: record.order.id,
        publicNumber: record.order.publicNumber,
        status: record.order.status,
        version: record.order.version,
        customer: `${record.order.guestName}${record.order.guestSurname ? ` ${record.order.guestSurname}` : ''}`,
        email: record.order.guestEmail,
        reservationExpiresAt: record.order.reservationExpiresAt?.toISOString() ?? null,
      },
      documents: record.documents.map((document) => ({
        id: document.id,
        kind: document.kind,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes.toString(),
        storageStatus: document.storageStatus,
        scanStatus: document.scanStatus,
        createdAt: document.createdAt.toISOString(),
      })),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toSyncJob(job: {
    id: string;
    direction: SyncDirection;
    eventType: string;
    adapter: string;
    messageId: string;
    externalEventId: string | null;
    internalEntityId: string | null;
    externalEntityId: string | null;
    entityKey: string | null;
    correlationId: string;
    status: SyncJobStatus;
    attempts: number;
    availableAt: Date;
    receivedAt: Date;
    processedAt: Date | null;
    nextRetryAt: Date | null;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: job.id,
      direction: job.direction,
      eventType: job.eventType,
      adapter: job.adapter,
      messageId: job.messageId,
      externalEventId: job.externalEventId,
      internalEntityId: job.internalEntityId,
      externalEntityId: job.externalEntityId,
      entityKey: job.entityKey,
      correlationId: job.correlationId,
      status: job.status,
      attempts: job.attempts,
      availableAt: job.availableAt.toISOString(),
      receivedAt: job.receivedAt.toISOString(),
      processedAt: job.processedAt?.toISOString() ?? null,
      nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private async countAppliedEvents(fragment: string): Promise<number> {
    return this.prisma.syncJob.count({
      where: {
        direction: SyncDirection.INBOUND,
        status: SyncJobStatus.APPLIED,
        eventType: { contains: fragment, mode: 'insensitive' },
      },
    });
  }

  private page<T>(items: readonly T[], page: number, limit: number, total: number): Record<string, unknown> {
    return {
      items,
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }

  private customerName(record: {
    guestName: string;
    guestSurname: string | null;
    customer?: { firstName: string | null; lastName: string | null } | null;
  }): string {
    const registered = [record.customer?.firstName, record.customer?.lastName].filter(Boolean).join(' ');
    return registered || [record.guestName, record.guestSurname].filter(Boolean).join(' ');
  }

  private staff(
    person: { id: string; email: string; firstName: string | null; lastName: string | null } | null,
  ): Record<string, string | null> | null {
    if (!person) return null;
    return {
      id: person.id,
      email: person.email,
      name: [person.firstName, person.lastName].filter(Boolean).join(' ') || null,
    };
  }

  private csvValue(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  private redactMetadata(value: Prisma.JsonValue | null | undefined): Prisma.JsonValue | null {
    if (value === undefined) return null;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => this.redactMetadata(entry));
    const redacted: Prisma.JsonObject = {};
    for (const [key, entry] of Object.entries(value as Prisma.JsonObject)) {
      redacted[key] = /(?:password|token|secret|authorization|payload)/i.test(key)
        ? '[redacted]'
        : this.redactMetadata(entry);
    }
    return redacted;
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Заказ не найден.' });
  }
}
