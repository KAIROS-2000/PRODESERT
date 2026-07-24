import type { OrderStatus, StatusSource } from './order.js';

export const ReservationStatus = {
  ACTIVE: 'ACTIVE',
  RELEASED: 'RELEASED',
  EXPIRED: 'EXPIRED',
  CONSUMED: 'CONSUMED',
} as const;

export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export interface StockReservationLineInput {
  readonly orderItemId: string;
  readonly variantId: string;
  readonly warehouseId: string;
  /** Decimal serialized as a string, with at most three fractional digits. */
  readonly quantity: string;
}

export interface ConfirmStockReservationInput {
  readonly expectedOrderVersion: number;
  readonly externalReservationId?: string;
  readonly sourceVersion?: string;
  readonly expiresAt: string;
  readonly source: StatusSource;
  readonly correlationId: string;
  readonly lines: readonly StockReservationLineInput[];
}

export interface ReleaseStockReservationInput {
  readonly expectedOrderVersion: number;
  readonly reason: string;
  readonly source: StatusSource;
  readonly correlationId: string;
}

export interface ExtendStockReservationInput {
  readonly expectedOrderVersion: number;
  readonly expiresAt: string;
  readonly sourceVersion?: string;
  readonly source: StatusSource;
  readonly correlationId: string;
}

export interface StockReservationView {
  readonly id: string;
  readonly orderId: string;
  readonly orderItemId: string;
  readonly variantId: string;
  readonly warehouseId: string;
  readonly quantity: string;
  readonly status: ReservationStatus;
  readonly externalReservationId: string | null;
  readonly sourceVersion: string | null;
  readonly expiresAt: string;
  readonly confirmedAt: string | null;
  readonly releasedAt: string | null;
  readonly consumedAt: string | null;
  readonly releaseReason: string | null;
  readonly source: StatusSource;
  readonly correlationId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StockReservationResult {
  readonly orderId: string;
  readonly orderVersion: number;
  readonly orderStatus: OrderStatus;
  readonly reservationExpiresAt: string | null;
  readonly reservations: readonly StockReservationView[];
  readonly idempotentReplay: boolean;
}
