import { createHash, randomUUID } from 'node:crypto';
import {
  type OneCAdapter,
  type OneCAdapterHealth,
  type OneCExchangeCursor,
  type OneCExportReceipt,
  type OneCImportPage,
  type OneCNormalizedItem,
  type OneCOrderStatusNotification,
  type OneCOrderStatusNotificationReceipt,
  type OneCReservationExtensionReceipt,
  type OneCReservationExtensionRequest,
  type OneCStockConfirmationReceipt,
  type OneCStockConfirmationRequest,
} from './one-c-adapter';
import { type OneCExportOrderCommand } from '../export/order-export.mapper';
import { canonicalOneCJson, oneCPayloadHash } from '../one-c-canonical-json';

interface StoredMockExport {
  readonly payloadHash: string;
  readonly receipt: OneCExportReceipt;
}

export class OneCAdapterConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  readonly retryable = false;

  constructor() {
    super('The mock 1C idempotency key is already associated with another payload');
    this.name = 'OneCAdapterConflictError';
  }
}

export class MockOneCAdapter implements OneCAdapter {
  readonly kind = 'mock' as const;
  private readonly exports = new Map<string, StoredMockExport>();
  private readonly stockConfirmations = new Map<
    string,
    { readonly payloadHash: string; readonly receipt: OneCStockConfirmationReceipt }
  >();
  private readonly statusNotifications = new Map<
    string,
    {
      readonly payloadHash: string;
      readonly receipt: OneCOrderStatusNotificationReceipt;
    }
  >();
  private readonly reservationExtensions = new Map<
    string,
    {
      readonly payloadHash: string;
      readonly receipt: OneCReservationExtensionReceipt;
    }
  >();

  constructor(
    private readonly options: {
      readonly reservationHours?: number;
      readonly now?: () => Date;
    } = {},
  ) {}

  async health(): Promise<OneCAdapterHealth> {
    return {
      status: 'healthy',
      adapter: this.kind,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
    };
  }

  async pullCatalog(cursor: OneCExchangeCursor): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.emptyPage(cursor);
  }

  async pullPrices(cursor: OneCExchangeCursor): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.emptyPage(cursor);
  }

  async pullInventory(cursor: OneCExchangeCursor): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.emptyPage(cursor);
  }

  async pullOrderEvents(cursor: OneCExchangeCursor): Promise<OneCImportPage<OneCNormalizedItem>> {
    return this.emptyPage(cursor);
  }

  async pushOrder(command: OneCExportOrderCommand): Promise<OneCExportReceipt> {
    const payloadHash = oneCPayloadHash(command.payload);
    const existing = this.exports.get(command.idempotencyKey);
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) {
        throw new OneCAdapterConflictError();
      }
      return existing.receipt;
    }

    const identityHash = createHash('sha256')
      .update(canonicalOneCJson({ idempotencyKey: command.idempotencyKey }), 'utf8')
      .digest('hex');
    const receipt: OneCExportReceipt = {
      externalOrderId: `mock-order-${identityHash.slice(0, 24)}`,
      acceptedAt: new Date().toISOString(),
      sourceRevision: `mock-${identityHash.slice(24, 40)}`,
    };
    this.exports.set(command.idempotencyKey, { payloadHash, receipt });
    return receipt;
  }

  async requestStockConfirmation(
    command: OneCStockConfirmationRequest,
  ): Promise<OneCStockConfirmationReceipt> {
    const payloadHash = oneCPayloadHash(command.payload);
    const existing = this.stockConfirmations.get(command.idempotencyKey);
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) {
        throw new OneCAdapterConflictError();
      }
      return existing.receipt;
    }

    const now = this.options.now?.() ?? new Date();
    const hours = this.options.reservationHours ?? 24;
    const identityHash = createHash('sha256')
      .update(canonicalOneCJson({ idempotencyKey: command.idempotencyKey }), 'utf8')
      .digest('hex');
    const externalReservationId = `mock-reserve-${identityHash.slice(0, 24)}`;
    const sourceRevision = String(command.payload.orderVersion);
    const receipt: OneCStockConfirmationReceipt = {
      requestId: `mock-stock-${identityHash.slice(0, 24)}`,
      acceptedAt: now.toISOString(),
      sourceRevision,
      statusEvent: {
        schemaVersion: '1.0',
        messageId: randomUUID(),
        eventType: 'order.status.updated',
        occurredAt: now.toISOString(),
        source: 'ONE_C',
        correlationId: command.correlationId,
        idempotencyKey: `mock:${externalReservationId}:v${command.payload.orderVersion}`,
        sourceRevision,
        payload: {
          externalOrderId: command.payload.externalOrderId,
          publicNumber: command.payload.publicNumber,
          eventId: `mock:${externalReservationId}:confirmed`,
          orderVersion: command.payload.orderVersion,
          status: 'AWAITING_PAYMENT',
          confirmedTotal: command.payload.confirmedTotal,
          currency: 'RUB',
          reservation: {
            externalReservationId,
            status: 'ACTIVE',
            expiresAt: new Date(now.getTime() + hours * 60 * 60 * 1_000).toISOString(),
          },
          payment: {
            status: 'NOT_PAID',
            confirmedAt: null,
            externalPaymentId: null,
          },
          lines: command.payload.lines.map((line) => ({
            externalVariantId: line.externalVariantId,
            quantity: line.quantity,
            confirmedUnitPrice: line.confirmedUnitPrice,
            confirmedLineTotal: line.confirmedLineTotal,
            stockSourceVersion: line.stockSourceVersion,
          })),
          comment: 'Наличие подтверждено mock-адаптером 1С.',
        },
      },
    };
    this.stockConfirmations.set(command.idempotencyKey, { payloadHash, receipt });
    return receipt;
  }

  async requestReservationExtension(
    command: OneCReservationExtensionRequest,
  ): Promise<OneCReservationExtensionReceipt> {
    const payloadHash = oneCPayloadHash(command.payload);
    const existing = this.reservationExtensions.get(command.idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new OneCAdapterConflictError();
      return existing.receipt;
    }
    const now = this.options.now?.() ?? new Date();
    const identityHash = createHash('sha256')
      .update(canonicalOneCJson({ idempotencyKey: command.idempotencyKey }), 'utf8')
      .digest('hex');
    const sourceOrderVersion = command.payload.sourceOrderVersion + 1;
    const receipt: OneCReservationExtensionReceipt = {
      requestId: `mock-extension-${identityHash.slice(0, 24)}`,
      acceptedAt: now.toISOString(),
      sourceRevision: String(sourceOrderVersion),
      statusEvent: {
        schemaVersion: '1.0',
        messageId: randomUUID(),
        eventType: 'order.status.updated',
        occurredAt: now.toISOString(),
        source: 'ONE_C',
        correlationId: command.correlationId,
        idempotencyKey: `mock:${command.payload.externalReservationId}:extension:v${sourceOrderVersion}`,
        sourceRevision: String(sourceOrderVersion),
        payload: {
          externalOrderId: command.payload.externalOrderId,
          publicNumber: command.payload.publicNumber,
          eventId: `mock:${command.payload.externalReservationId}:extended:${sourceOrderVersion}`,
          orderVersion: sourceOrderVersion,
          status: 'AWAITING_PAYMENT',
          confirmedTotal: command.payload.confirmedTotal,
          currency: 'RUB',
          reservation: {
            externalReservationId: command.payload.externalReservationId,
            status: 'ACTIVE',
            expiresAt: command.payload.requestedExpiresAt,
          },
          payment: {
            status: 'NOT_PAID',
            confirmedAt: null,
            externalPaymentId: null,
          },
          lines: command.payload.lines.map((line) => ({ ...line })),
          comment: `Резерв продлён mock-адаптером 1С. ${command.payload.reason}`,
        },
      },
    };
    this.reservationExtensions.set(command.idempotencyKey, { payloadHash, receipt });
    return receipt;
  }

  async publishOrderStatus(
    command: OneCOrderStatusNotification,
  ): Promise<OneCOrderStatusNotificationReceipt> {
    const payloadHash = oneCPayloadHash(command.payload);
    const existing = this.statusNotifications.get(command.idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new OneCAdapterConflictError();
      }
      return existing.receipt;
    }
    const now = this.options.now?.() ?? new Date();
    const identityHash = createHash('sha256')
      .update(canonicalOneCJson({ idempotencyKey: command.idempotencyKey }), 'utf8')
      .digest('hex');
    const receipt: OneCOrderStatusNotificationReceipt = {
      requestId: `mock-status-${identityHash.slice(0, 24)}`,
      acceptedAt: now.toISOString(),
      sourceRevision: String(command.payload.orderVersion),
    };
    this.statusNotifications.set(command.idempotencyKey, { payloadHash, receipt });
    return receipt;
  }

  private emptyPage(cursor: OneCExchangeCursor): OneCImportPage<OneCNormalizedItem> {
    return {
      items: [],
      nextCursor: null,
      sourceRevision: cursor.value ?? 'mock-initial',
    };
  }
}
