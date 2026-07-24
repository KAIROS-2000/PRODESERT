import { Prisma } from '@prisma/client';
import {
  type ReservationConfirmationSnapshot,
  ReservationPolicyError,
  ReservationPolicyService,
  type StockConfirmationCommand,
} from './reservation-policy.service';

const decimal = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error('fixture must contain an item');
  return value;
}

const snapshot = (): ReservationConfirmationSnapshot => ({
  order: {
    id: 'order-1',
    status: 'AWAITING_STOCK_CONFIRMATION',
    oneCId: '1c-order-1',
    oneCVersion: null,
    pickupLocationId: 'pickup-1',
    grandTotal: decimal('3500.00'),
    currency: 'RUB',
  },
  items: [
    {
      id: 'item-1',
      variantId: 'variant-1',
      oneCVariantId: '1c-variant-1',
      quantity: decimal('2'),
      unitPrice: decimal('1750'),
      lineTotal: decimal('3500'),
    },
  ],
  warehouse: {
    id: 'warehouse-1',
    oneCId: '1c-warehouse-1',
    pickupLocationId: 'pickup-1',
    active: true,
  },
  balances: [
    {
      id: 'balance-1',
      variantId: 'variant-1',
      warehouseId: 'warehouse-1',
      available: decimal('5'),
      sourceVersion: 'stock-17',
    },
  ],
});

const command = (): StockConfirmationCommand => ({
  orderId: 'order-1',
  externalOrderId: '1c-order-1',
  orderVersion: 1,
  sourceVersion: 'order-1',
  confirmedTotal: '3500.00',
  currency: 'RUB',
  warehouseOneCId: '1c-warehouse-1',
  externalReservationId: 'reserve-1',
  expiresAt: new Date('2026-07-26T12:00:00.000Z'),
  lines: [
    {
      externalVariantId: '1c-variant-1',
      quantity: '2',
      confirmedUnitPrice: '1750.00',
      confirmedLineTotal: '3500.00',
      stockSourceVersion: 'stock-17',
    },
  ],
});

describe('ReservationPolicyService', () => {
  const policy = new ReservationPolicyService();
  const now = new Date('2026-07-25T12:00:00.000Z');

  it('accepts an exact confirmation with sufficient current stock', () => {
    expect(() => policy.assertCanConfirm(snapshot(), command(), now)).not.toThrow();
  });

  it.each([
    ['TOTAL_MISMATCH', { confirmedTotal: '3499.99' }],
    ['CURRENCY_MISMATCH', { currency: 'USD' }],
    ['RESERVATION_EXPIRY_INVALID', { expiresAt: now }],
    ['ONE_C_VERSION_STALE', { orderVersion: 7 }],
  ] as const)('rejects %s before any persistence', (expectedCode, override) => {
    const state = snapshot();
    if (expectedCode === 'ONE_C_VERSION_STALE') state.order.oneCVersion = 7;
    const input = { ...command(), ...override };
    try {
      policy.assertCanConfirm(state, input, now);
      throw new Error('expected policy error');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ReservationPolicyError);
      expect((error as ReservationPolicyError).code).toBe(expectedCode);
    }
  });

  it('rejects an omitted, duplicated, or additional 1C line', () => {
    const input = command();
    input.lines = [...input.lines, { ...first(input.lines) }];
    expect(() => policy.assertCanConfirm(snapshot(), input, now)).toThrow(
      expect.objectContaining({ code: 'LINES_MISMATCH' }),
    );
  });

  it('rejects an unsolicited confirmation before the order was exported', () => {
    const state = snapshot();
    state.order.oneCId = null;

    expect(() => policy.assertCanConfirm(state, command(), now)).toThrow(
      expect.objectContaining({ code: 'ONE_C_ORDER_ID_MISMATCH' }),
    );
  });

  it('rejects quantity and amount drift', () => {
    const quantity = command();
    quantity.lines = [{ ...first(quantity.lines), quantity: '3' }];
    expect(() => policy.assertCanConfirm(snapshot(), quantity, now)).toThrow(
      expect.objectContaining({ code: 'LINE_QUANTITY_MISMATCH' }),
    );

    const price = command();
    price.lines = [{ ...first(price.lines), confirmedUnitPrice: '1700.00' }];
    expect(() => policy.assertCanConfirm(snapshot(), price, now)).toThrow(
      expect.objectContaining({ code: 'LINE_PRICE_MISMATCH' }),
    );
  });

  it('rejects the wrong pickup warehouse and insufficient availability', () => {
    const wrongWarehouse = snapshot();
    wrongWarehouse.warehouse.pickupLocationId = 'pickup-2';
    expect(() => policy.assertCanConfirm(wrongWarehouse, command(), now)).toThrow(
      expect.objectContaining({ code: 'WAREHOUSE_MISMATCH' }),
    );

    const insufficient = snapshot();
    first(insufficient.balances).available = decimal('1');
    expect(() => policy.assertCanConfirm(insufficient, command(), now)).toThrow(
      expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    );
  });

  it('rejects a stale stock projection revision when 1C supplied one', () => {
    const state = snapshot();
    first(state.balances).sourceVersion = 'stock-18';
    expect(() => policy.assertCanConfirm(state, command(), now)).toThrow(
      expect.objectContaining({ code: 'STOCK_SOURCE_VERSION_MISMATCH' }),
    );
  });
});
