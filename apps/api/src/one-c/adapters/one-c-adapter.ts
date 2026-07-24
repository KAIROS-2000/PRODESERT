import { type Provider } from '@nestjs/common';
import { type OneCOrderStatusEnvelopeDto } from '../dto/one-c-order-status.dto';
import { type OneCExportOrderCommand } from '../export/order-export.mapper';

export const ONE_C_ADAPTER = Symbol('ONE_C_ADAPTER');

export type OneCAdapterKind = 'mock' | 'commerceml2' | 'rest';

export interface OneCExchangeCursor {
  readonly value: string | null;
}

export type OneCNormalizedItem = Readonly<Record<string, unknown>>;

export interface OneCImportPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly sourceRevision: string;
}

export interface OneCExportReceipt {
  readonly externalOrderId: string;
  readonly acceptedAt: string;
  readonly sourceRevision: string | null;
}

/**
 * A claim-check outbox worker builds this command from the current order
 * snapshot. It deliberately excludes customer identity and contact data:
 * stock confirmation only needs commercial lines and the selected pickup
 * warehouse.
 */
export interface OneCStockConfirmationRequest {
  readonly schemaVersion: '1.0';
  readonly messageId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly eventType: 'order.stock_confirmation.requested';
  readonly occurredAt: string;
  readonly payload: {
    readonly orderId: string;
    readonly externalOrderId: string;
    readonly publicNumber: string;
    readonly orderVersion: number;
    readonly currency: 'RUB';
    readonly confirmedTotal: string;
    readonly warehouseExternalId: string;
    readonly lines: readonly {
      readonly externalVariantId: string;
      readonly quantity: string;
      readonly confirmedUnitPrice: string;
      readonly confirmedLineTotal: string;
      readonly stockSourceVersion: string;
    }[];
  };
}

export interface OneCStockConfirmationReceipt {
  readonly requestId: string;
  readonly acceptedAt: string;
  readonly sourceRevision: string | null;
  /**
   * The real REST adapter normally receives the status later via the signed
   * inbox endpoint. The deterministic mock returns it immediately, but it is
   * still persisted and applied through the same durable inbox processor.
   */
  readonly statusEvent?: OneCOrderStatusEnvelopeDto;
}

export interface OneCOrderStatusNotification {
  readonly schemaVersion: '1.0';
  readonly messageId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly eventType: 'order.reservation_expired';
  readonly occurredAt: string;
  readonly payload: {
    readonly orderId: string;
    readonly externalOrderId: string;
    readonly publicNumber: string;
    readonly orderVersion: number;
    readonly status: 'RESERVATION_EXPIRED';
  };
}

export interface OneCOrderStatusNotificationReceipt {
  readonly requestId: string;
  readonly acceptedAt: string;
  readonly sourceRevision: string | null;
}

export interface OneCAdapterHealth {
  readonly status: 'healthy' | 'degraded' | 'unavailable';
  readonly adapter: OneCAdapterKind;
  readonly checkedAt: string;
  readonly latencyMs: number;
}

export interface OneCAdapter {
  readonly kind: OneCAdapterKind;
  health(signal?: AbortSignal): Promise<OneCAdapterHealth>;
  pullCatalog(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>>;
  pullPrices(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>>;
  pullInventory(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>>;
  pullOrderEvents(
    cursor: OneCExchangeCursor,
    signal?: AbortSignal,
  ): Promise<OneCImportPage<OneCNormalizedItem>>;
  pushOrder(command: OneCExportOrderCommand, signal?: AbortSignal): Promise<OneCExportReceipt>;
  requestStockConfirmation(
    command: OneCStockConfirmationRequest,
    signal?: AbortSignal,
  ): Promise<OneCStockConfirmationReceipt>;
  publishOrderStatus(
    command: OneCOrderStatusNotification,
    signal?: AbortSignal,
  ): Promise<OneCOrderStatusNotificationReceipt>;
}

export function provideOneCAdapter(adapter: OneCAdapter): Provider {
  return { provide: ONE_C_ADAPTER, useValue: adapter };
}
