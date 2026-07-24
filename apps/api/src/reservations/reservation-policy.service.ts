import { Injectable } from '@nestjs/common';
import { Prisma, type OrderStatus } from '@prisma/client';

export interface StockConfirmationLine {
  externalVariantId: string;
  quantity: string;
  confirmedUnitPrice: string;
  confirmedLineTotal: string;
  stockSourceVersion?: string;
}

export interface StockConfirmationCommand {
  orderId: string;
  externalOrderId: string;
  orderVersion: number;
  sourceVersion: string;
  confirmedTotal: string;
  currency: string;
  warehouseOneCId: string;
  externalReservationId: string;
  expiresAt: Date;
  lines: readonly StockConfirmationLine[];
  eventId?: string;
  correlationId?: string;
  comment?: string;
}

export interface ReservationOrderSnapshot {
  id: string;
  status: OrderStatus;
  oneCId: string | null;
  oneCVersion: number | null;
  pickupLocationId: string;
  grandTotal: Prisma.Decimal;
  currency: string;
}

export interface ReservationOrderItemSnapshot {
  id: string;
  variantId: string | null;
  oneCVariantId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface ReservationWarehouseSnapshot {
  id: string;
  oneCId: string;
  pickupLocationId: string | null;
  active: boolean;
}

export interface ReservationBalanceSnapshot {
  id: string;
  variantId: string;
  warehouseId: string;
  available: Prisma.Decimal;
  sourceVersion: string | null;
}

export interface ReservationConfirmationSnapshot {
  order: ReservationOrderSnapshot;
  items: readonly ReservationOrderItemSnapshot[];
  warehouse: ReservationWarehouseSnapshot;
  balances: readonly ReservationBalanceSnapshot[];
}

export type ReservationPolicyErrorCode =
  | 'ORDER_NOT_AWAITING_STOCK'
  | 'ONE_C_CONFIRMATION_INVALID'
  | 'ONE_C_ORDER_ID_MISMATCH'
  | 'ONE_C_VERSION_STALE'
  | 'RESERVATION_EXPIRY_INVALID'
  | 'WAREHOUSE_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'TOTAL_MISMATCH'
  | 'LINES_MISMATCH'
  | 'LINE_QUANTITY_MISMATCH'
  | 'LINE_PRICE_MISMATCH'
  | 'LINE_TOTAL_MISMATCH'
  | 'STOCK_BALANCE_MISSING'
  | 'STOCK_SOURCE_VERSION_MISMATCH'
  | 'INSUFFICIENT_STOCK';

export class ReservationPolicyError extends Error {
  constructor(
    readonly code: ReservationPolicyErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, string | number | null>>,
  ) {
    super(message);
    this.name = 'ReservationPolicyError';
  }
}

@Injectable()
export class ReservationPolicyService {
  assertCanConfirm(
    snapshot: ReservationConfirmationSnapshot,
    command: StockConfirmationCommand,
    now: Date,
  ): void {
    const { order, items, warehouse, balances } = snapshot;
    if (
      !Number.isInteger(command.orderVersion) ||
      command.orderVersion < 1 ||
      !command.externalOrderId.trim() ||
      !command.externalReservationId.trim() ||
      !command.sourceVersion.trim()
    ) {
      this.fail('ONE_C_CONFIRMATION_INVALID', 'Подтверждение 1С содержит некорректные поля.');
    }
    if (order.status !== 'AWAITING_STOCK_CONFIRMATION') {
      this.fail('ORDER_NOT_AWAITING_STOCK', 'Заказ не ожидает подтверждения наличия.');
    }
    if (!order.oneCId || order.oneCId !== command.externalOrderId) {
      this.fail('ONE_C_ORDER_ID_MISMATCH', 'Идентификатор заказа 1С не совпадает.');
    }
    if (order.oneCVersion !== null && command.orderVersion <= order.oneCVersion) {
      this.fail('ONE_C_VERSION_STALE', 'Версия события 1С устарела.', {
        currentVersion: order.oneCVersion,
        receivedVersion: command.orderVersion,
      });
    }
    if (
      !Number.isFinite(command.expiresAt.getTime()) ||
      command.expiresAt.getTime() <= now.getTime()
    ) {
      this.fail('RESERVATION_EXPIRY_INVALID', '1С вернула уже истёкший резерв.');
    }
    if (
      !warehouse.active ||
      warehouse.oneCId !== command.warehouseOneCId ||
      warehouse.pickupLocationId !== order.pickupLocationId
    ) {
      this.fail('WAREHOUSE_MISMATCH', 'Склад резерва не соответствует точке самовывоза.');
    }
    if (command.currency !== 'RUB' || command.currency !== order.currency) {
      this.fail('CURRENCY_MISMATCH', 'Валюта подтверждения не совпадает с заказом.');
    }
    if (!this.decimal(command.confirmedTotal).equals(order.grandTotal)) {
      this.fail('TOTAL_MISMATCH', 'Подтверждённая сумма не совпадает с заказом.', {
        expected: order.grandTotal.toFixed(2),
        received: command.confirmedTotal,
      });
    }
    if (items.length === 0 || command.lines.length !== items.length) {
      this.fail('LINES_MISMATCH', 'Состав подтверждения не совпадает с заказом.');
    }

    const linesByExternalVariant = new Map<string, StockConfirmationLine>();
    for (const line of command.lines) {
      if (linesByExternalVariant.has(line.externalVariantId)) {
        this.fail('LINES_MISMATCH', 'В подтверждении есть повторяющаяся строка товара.');
      }
      linesByExternalVariant.set(line.externalVariantId, line);
    }
    const balancesByVariant = new Map(balances.map((balance) => [balance.variantId, balance]));

    for (const item of items) {
      if (!item.variantId) {
        this.fail('LINES_MISMATCH', 'В заказе отсутствует локальная ссылка на вариант.', {
          orderItemId: item.id,
        });
      }
      const line = linesByExternalVariant.get(item.oneCVariantId);
      if (!line) {
        this.fail('LINES_MISMATCH', 'В подтверждении отсутствует строка заказа.', {
          externalVariantId: item.oneCVariantId,
        });
      }
      if (!this.decimal(line.quantity).equals(item.quantity)) {
        this.fail('LINE_QUANTITY_MISMATCH', 'Количество в 1С не совпадает с заказом.', {
          externalVariantId: item.oneCVariantId,
          expected: item.quantity.toString(),
          received: line.quantity,
        });
      }
      if (!this.decimal(line.confirmedUnitPrice).equals(item.unitPrice)) {
        this.fail('LINE_PRICE_MISMATCH', 'Цена строки в 1С не совпадает с заказом.', {
          externalVariantId: item.oneCVariantId,
          expected: item.unitPrice.toFixed(2),
          received: line.confirmedUnitPrice,
        });
      }
      if (!this.decimal(line.confirmedLineTotal).equals(item.lineTotal)) {
        this.fail('LINE_TOTAL_MISMATCH', 'Сумма строки в 1С не совпадает с заказом.', {
          externalVariantId: item.oneCVariantId,
          expected: item.lineTotal.toFixed(2),
          received: line.confirmedLineTotal,
        });
      }

      const balance = balancesByVariant.get(item.variantId);
      if (!balance || balance.warehouseId !== warehouse.id) {
        this.fail('STOCK_BALANCE_MISSING', 'Нет остатка по строке на выбранном складе.', {
          externalVariantId: item.oneCVariantId,
        });
      }
      if (line.stockSourceVersion && balance.sourceVersion !== line.stockSourceVersion) {
        this.fail('STOCK_SOURCE_VERSION_MISMATCH', 'Версия остатка изменилась.', {
          externalVariantId: item.oneCVariantId,
          expected: line.stockSourceVersion,
          actual: balance.sourceVersion,
        });
      }
      if (balance.available.lessThan(item.quantity)) {
        this.fail('INSUFFICIENT_STOCK', 'Остатка недостаточно для резерва.', {
          externalVariantId: item.oneCVariantId,
          available: balance.available.toString(),
          requested: item.quantity.toString(),
        });
      }
    }
    if (linesByExternalVariant.size !== items.length) {
      this.fail('LINES_MISMATCH', 'Подтверждение содержит неизвестные строки.');
    }
  }

  private decimal(value: string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(value);
    } catch {
      this.fail('LINES_MISMATCH', '1С передала некорректное числовое значение.');
    }
  }

  private fail(
    code: ReservationPolicyErrorCode,
    message: string,
    details?: Readonly<Record<string, string | number | null>>,
  ): never {
    throw new ReservationPolicyError(code, message, details);
  }
}
