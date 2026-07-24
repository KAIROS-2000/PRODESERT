import { Inject, Injectable } from '@nestjs/common';
import {
  FulfillmentMethod,
  PaymentMethod,
  Prisma,
  SyncDirection,
  SyncJobStatus,
  type OutboxEvent,
} from '@prisma/client';
import { type OutboxEventHandler } from '../outbox/outbox-handler';
import { IntegrationDispatchError } from '../outbox/retry-policy';
import { PrismaService } from '../prisma/prisma.service';
import {
  ONE_C_ADAPTER,
  type OneCAdapter,
  type OneCOrderStatusNotification,
  type OneCStockConfirmationReceipt,
  type OneCStockConfirmationRequest,
} from './adapters/one-c-adapter';
import { OneCAdapterConflictError } from './adapters/mock-one-c.adapter';
import {
  OneCAdapterRequestError,
  isRetryableOneCAdapterError,
} from './adapters/rest-one-c.adapter';
import {
  mapOrderToOneCExport,
  type OneCExportOrderCommand,
  type OneCOrderExportRecord,
} from './export/order-export.mapper';
import { OneCInboxService } from './inbox/one-c-inbox.service';
import { oneCPayloadHash } from './one-c-canonical-json';

export const ONE_C_OUTBOX_HANDLER = Symbol('ONE_C_OUTBOX_HANDLER');

const SUPPORTED_EVENTS = new Set([
  'order.created',
  'order.reservation_expired',
  'order.stock_confirmation.requested',
]);

@Injectable()
export class OneCCommandService implements OutboxEventHandler {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ONE_C_ADAPTER) private readonly adapter: OneCAdapter,
    private readonly inbox: OneCInboxService,
  ) {}

  supports(eventType: string): boolean {
    return SUPPORTED_EVENTS.has(eventType);
  }

  async handle(event: OutboxEvent): Promise<void> {
    if (event.aggregateType !== 'order') {
      throw new IntegrationDispatchError('ONE_C_OUTBOX_AGGREGATE_UNSUPPORTED', false);
    }
    const claim = this.claim(event);
    if (event.eventType === 'order.created') {
      const command = await this.buildOrderExport(event);
      const receipt = await this.dispatch(() => this.adapter.pushOrder(command));
      await this.recordOrderExport(event, command, receipt);
      return;
    }
    if (event.eventType === 'order.stock_confirmation.requested') {
      const command = await this.buildStockConfirmationRequest(event, claim.orderVersion);
      const receipt = await this.dispatch(() => this.adapter.requestStockConfirmation(command));
      await this.recordStockConfirmationRequest(event, command, receipt);
      if (receipt.statusEvent) {
        await this.inbox.acceptOrderStatus(receipt.statusEvent);
      }
      return;
    }
    if (event.eventType === 'order.reservation_expired') {
      const command = await this.buildReservationExpiredNotification(event, claim.orderVersion);
      const receipt = await this.dispatch(() => this.adapter.publishOrderStatus(command));
      await this.prisma.$transaction(
        (transaction) =>
          this.recordOutboundJob(transaction, event, {
            externalEntityId: command.payload.externalOrderId,
            sourceRevision: receipt.sourceRevision,
            commandHash: oneCPayloadHash(command),
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return;
    }
    throw new IntegrationDispatchError('ONE_C_OUTBOX_EVENT_UNSUPPORTED', false);
  }

  async buildOrderExport(event: OutboxEvent): Promise<OneCExportOrderCommand> {
    if (event.eventType !== 'order.created') {
      throw new IntegrationDispatchError('ONE_C_ORDER_EXPORT_EVENT_INVALID', false);
    }
    const claim = this.claim(event);
    const order = await this.prisma.order.findUnique({
      where: { id: claim.orderId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!order) {
      throw new IntegrationDispatchError('ONE_C_ORDER_NOT_FOUND', false);
    }
    const exportVersion = this.createdEventVersion(event.idempotencyKey);
    if (
      order.fulfillmentMethod !== FulfillmentMethod.PICKUP ||
      order.paymentMethod !== PaymentMethod.BANK_TRANSFER ||
      order.currency !== 'RUB' ||
      order.source !== 'STOREFRONT'
    ) {
      throw new IntegrationDispatchError('ONE_C_ORDER_INVARIANT_VIOLATION', false);
    }
    const record: OneCOrderExportRecord = {
      id: order.id,
      publicNumber: order.publicNumber,
      customerId: order.customerId,
      guestName: order.guestName,
      guestSurname: order.guestSurname,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
      organizationData: order.organizationData,
      fulfillmentMethod: 'PICKUP',
      pickupLocationCode: order.pickupLocationCode,
      paymentMethod: 'BANK_TRANSFER',
      customerComment: order.customerComment,
      desiredPickupAt: order.desiredPickupAt,
      currency: 'RUB',
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      grandTotal: order.grandTotal,
      privacyConsentAt: order.privacyConsentAt,
      orderTermsConsentAt: order.orderTermsConsentAt,
      source: 'STOREFRONT',
      version: exportVersion,
      createdAt: order.createdAt,
      items: order.items,
    };
    return mapOrderToOneCExport(record, {
      messageId: event.messageId,
      correlationId: event.correlationId,
      personalDataDocumentVersion: order.privacyConsentVersion,
      orderTermsDocumentVersion: order.orderTermsConsentVersion,
    });
  }

  private async buildStockConfirmationRequest(
    event: OutboxEvent,
    requestedVersion?: number,
  ): Promise<OneCStockConfirmationRequest> {
    if (!requestedVersion || !Number.isInteger(requestedVersion) || requestedVersion < 1) {
      throw new IntegrationDispatchError('ONE_C_OUTBOX_CLAIM_INVALID', false);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: event.aggregateId },
      include: { items: { orderBy: { id: 'asc' } } },
    });
    if (!order) {
      throw new IntegrationDispatchError('ONE_C_ORDER_NOT_FOUND', false);
    }
    if (!order.oneCId) {
      throw new IntegrationDispatchError('ONE_C_ORDER_NOT_EXPORTED', true);
    }
    if (order.currency !== 'RUB') {
      throw new IntegrationDispatchError('ONE_C_ORDER_CURRENCY_UNSUPPORTED', false);
    }
    const warehouses = await this.prisma.warehouse.findMany({
      where: { pickupLocationId: order.pickupLocationId, active: true },
      select: { id: true, oneCId: true },
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
    const variantIds: string[] = [];
    for (const item of order.items) {
      if (!item.variantId) {
        throw new IntegrationDispatchError('ONE_C_ORDER_LINE_NOT_LINKED', false);
      }
      variantIds.push(item.variantId);
    }
    const balances = await this.prisma.stockBalance.findMany({
      where: { warehouseId: warehouse.id, variantId: { in: variantIds } },
      select: { variantId: true, sourceVersion: true },
    });
    const sourceVersionByVariant = new Map(
      balances.map((balance) => [balance.variantId, balance.sourceVersion]),
    );
    const lines = order.items.map((item) => {
      if (!item.variantId) {
        throw new IntegrationDispatchError('ONE_C_ORDER_LINE_NOT_LINKED', false);
      }
      const stockSourceVersion = sourceVersionByVariant.get(item.variantId);
      if (!stockSourceVersion?.trim()) {
        throw new IntegrationDispatchError('ONE_C_STOCK_SOURCE_VERSION_MISSING', false);
      }
      return {
        externalVariantId: item.oneCVariantId,
        quantity: item.quantity.toFixed(3),
        confirmedUnitPrice: item.unitPrice.toFixed(2),
        confirmedLineTotal: item.lineTotal.toFixed(2),
        stockSourceVersion,
      };
    });

    return {
      schemaVersion: '1.0',
      messageId: event.messageId,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey,
      eventType: 'order.stock_confirmation.requested',
      occurredAt: event.createdAt.toISOString(),
      payload: {
        orderId: order.id,
        externalOrderId: order.oneCId,
        publicNumber: order.publicNumber,
        orderVersion: requestedVersion,
        currency: 'RUB',
        confirmedTotal: order.grandTotal.toFixed(2),
        warehouseExternalId: warehouse.oneCId,
        lines,
      },
    };
  }

  private async buildReservationExpiredNotification(
    event: OutboxEvent,
    orderVersion?: number,
  ): Promise<OneCOrderStatusNotification> {
    if (!orderVersion || !Number.isInteger(orderVersion) || orderVersion < 1) {
      throw new IntegrationDispatchError('ONE_C_OUTBOX_CLAIM_INVALID', false);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: event.aggregateId },
      select: { id: true, oneCId: true, publicNumber: true },
    });
    if (!order) {
      throw new IntegrationDispatchError('ONE_C_ORDER_NOT_FOUND', false);
    }
    if (!order.oneCId) {
      throw new IntegrationDispatchError('ONE_C_ORDER_NOT_EXPORTED', true);
    }
    return {
      schemaVersion: '1.0',
      messageId: event.messageId,
      correlationId: event.correlationId,
      idempotencyKey: event.idempotencyKey,
      eventType: 'order.reservation_expired',
      occurredAt: event.createdAt.toISOString(),
      payload: {
        orderId: order.id,
        externalOrderId: order.oneCId,
        publicNumber: order.publicNumber,
        orderVersion,
        status: 'RESERVATION_EXPIRED',
      },
    };
  }

  private async recordOrderExport(
    event: OutboxEvent,
    command: OneCExportOrderCommand,
    receipt: Awaited<ReturnType<OneCAdapter['pushOrder']>>,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM orders WHERE id = ${event.aggregateId}::uuid FOR UPDATE
        `;
        const order = await transaction.order.findUnique({
          where: { id: event.aggregateId },
          select: { oneCId: true },
        });
        if (!order) {
          throw new IntegrationDispatchError('ONE_C_ORDER_NOT_FOUND', false);
        }
        if (order.oneCId && order.oneCId !== receipt.externalOrderId) {
          throw new IntegrationDispatchError('ONE_C_EXTERNAL_ORDER_ID_CONFLICT', false);
        }
        await this.recordOutboundJob(transaction, event, {
          externalEntityId: receipt.externalOrderId,
          sourceRevision: receipt.sourceRevision,
          commandHash: oneCPayloadHash(command),
        });
        if (!order.oneCId) {
          await transaction.order.update({
            where: { id: event.aggregateId },
            data: { oneCId: receipt.externalOrderId },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async recordStockConfirmationRequest(
    event: OutboxEvent,
    command: OneCStockConfirmationRequest,
    receipt: OneCStockConfirmationReceipt,
  ): Promise<void> {
    await this.prisma.$transaction(
      (transaction) =>
        this.recordOutboundJob(transaction, event, {
          externalEntityId: command.payload.externalOrderId,
          sourceRevision: receipt.sourceRevision,
          commandHash: oneCPayloadHash(command),
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async recordOutboundJob(
    transaction: Prisma.TransactionClient,
    event: OutboxEvent,
    details: {
      readonly externalEntityId: string;
      readonly sourceRevision: string | null;
      readonly commandHash: string;
    },
  ): Promise<void> {
    const existing = await transaction.syncJob.findUnique({
      where: { messageId: event.messageId },
    });
    if (existing) {
      if (
        existing.direction !== SyncDirection.OUTBOUND ||
        existing.eventType !== event.eventType ||
        existing.adapter !== `one-c:${this.adapter.kind}` ||
        existing.internalEntityId !== event.aggregateId ||
        existing.externalEntityId !== details.externalEntityId ||
        existing.idempotencyKey !== event.idempotencyKey ||
        existing.payloadHash !== details.commandHash
      ) {
        throw new IntegrationDispatchError('ONE_C_OUTBOUND_JOURNAL_CONFLICT', false);
      }
      return;
    }
    await transaction.syncJob.create({
      data: {
        direction: SyncDirection.OUTBOUND,
        eventType: event.eventType,
        adapter: `one-c:${this.adapter.kind}`,
        messageId: event.messageId,
        internalEntityId: event.aggregateId,
        externalEntityId: details.externalEntityId,
        entityKey: `order:${event.aggregateId}`,
        idempotencyKey: event.idempotencyKey,
        correlationId: event.correlationId,
        schemaVersion: event.schemaVersion,
        sourceRevision: details.sourceRevision,
        sourceSequence: this.eventSequence(event),
        payloadHash: details.commandHash,
        payload: {
          outboxEventId: event.id,
          eventType: event.eventType,
          orderId: event.aggregateId,
        },
        status: SyncJobStatus.APPLIED,
        attempts: 1,
        receivedAt: event.createdAt,
        processedAt: new Date(),
      },
    });
  }

  private claim(event: OutboxEvent): { readonly orderId: string; readonly orderVersion?: number } {
    if (
      typeof event.payload !== 'object' ||
      event.payload === null ||
      Array.isArray(event.payload) ||
      typeof event.payload.orderId !== 'string' ||
      event.payload.orderId !== event.aggregateId
    ) {
      throw new IntegrationDispatchError('ONE_C_OUTBOX_CLAIM_INVALID', false);
    }
    const version = event.payload.orderVersion;
    if (version !== undefined && (!Number.isInteger(version) || Number(version) < 1)) {
      throw new IntegrationDispatchError('ONE_C_OUTBOX_CLAIM_INVALID', false);
    }
    return {
      orderId: event.payload.orderId,
      ...(typeof version === 'number' ? { orderVersion: version } : {}),
    };
  }

  private createdEventVersion(idempotencyKey: string): number {
    const match = /:created:v(\d+)$/.exec(idempotencyKey);
    const version = match?.[1] ? Number(match[1]) : Number.NaN;
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new IntegrationDispatchError('ONE_C_ORDER_EXPORT_VERSION_INVALID', false);
    }
    return version;
  }

  private eventSequence(event: OutboxEvent): number | undefined {
    if (event.eventType === 'order.created') {
      return this.createdEventVersion(event.idempotencyKey);
    }
    if (
      typeof event.payload === 'object' &&
      event.payload !== null &&
      !Array.isArray(event.payload) &&
      typeof event.payload.orderVersion === 'number' &&
      Number.isInteger(event.payload.orderVersion) &&
      event.payload.orderVersion >= 1
    ) {
      return event.payload.orderVersion;
    }
    return undefined;
  }

  private async dispatch<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof OneCAdapterRequestError) {
        throw new IntegrationDispatchError(
          `ONE_C_${error.kind}`,
          isRetryableOneCAdapterError(error),
        );
      }
      if (error instanceof OneCAdapterConflictError) {
        throw new IntegrationDispatchError('ONE_C_IDEMPOTENCY_CONFLICT', false);
      }
      throw error;
    }
  }
}
