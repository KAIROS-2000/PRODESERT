import { Prisma } from '@prisma/client';
import { ReservationPolicyService } from './reservation-policy.service';
import { ReservationService } from './reservation.service';

function transactionHarness(tx: Record<string, unknown>): { $transaction: jest.Mock } {
  return {
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
  };
}

describe('ReservationService', () => {
  it('queues one idempotent manager command without changing order status', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 3,
      oneCId: '1c-order-1',
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      outboxEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = transactionHarness(tx);
    const outbox = {
      create: jest.fn().mockResolvedValue({
        messageId: '20000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-07-25T12:00:00.000Z'),
      }),
    };
    const service = new ReservationService(
      prisma as never,
      new ReservationPolicyService(),
      {} as never,
      outbox as never,
    );

    await expect(
      service.requestStockConfirmation({
        orderId: order.id,
        expectedVersion: 3,
        actorUserId: '30000000-0000-4000-8000-000000000001',
        actorRole: 'MANAGER',
        correlationId: 'request-1',
      }),
    ).resolves.toMatchObject({
      orderStatus: 'AWAITING_STOCK_CONFIRMATION',
      orderVersion: 3,
      duplicate: false,
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(outbox.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        aggregateType: 'order',
        eventType: 'order.stock_confirmation.requested',
        idempotencyKey: `order.stock-confirmation-requested:${order.id}:3`,
        payload: { orderId: order.id, orderVersion: 3 },
      }),
    );
  });

  it('returns the existing outbox command on a retry and creates no second audit event', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 3,
      oneCId: '1c-order-1',
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      outboxEvent: {
        findUnique: jest.fn().mockResolvedValue({
          messageId: '20000000-0000-4000-8000-000000000001',
          createdAt: new Date('2026-07-25T12:00:00.000Z'),
        }),
      },
      auditLog: { create: jest.fn() },
    };
    const outbox = { create: jest.fn() };
    const service = new ReservationService(
      transactionHarness(tx) as never,
      new ReservationPolicyService(),
      {} as never,
      outbox as never,
    );

    await expect(
      service.requestStockConfirmation({
        orderId: order.id,
        expectedVersion: 3,
        actorUserId: '30000000-0000-4000-8000-000000000001',
        actorRole: 'ADMIN',
      }),
    ).resolves.toMatchObject({ duplicate: true });
    expect(outbox.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not queue stock confirmation until the order has been exported to 1C', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 3,
      oneCId: null,
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      outboxEvent: { findUnique: jest.fn() },
    };
    const outbox = { create: jest.fn() };
    const service = new ReservationService(
      transactionHarness(tx) as never,
      new ReservationPolicyService(),
      {} as never,
      outbox as never,
    );

    await expect(
      service.requestStockConfirmation({
        orderId: order.id,
        expectedVersion: 3,
        actorUserId: '30000000-0000-4000-8000-000000000001',
        actorRole: 'MANAGER',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_EXPORTED_TO_ONE_C' }),
    });
    expect(tx.outboxEvent.findUnique).not.toHaveBeenCalled();
    expect(outbox.create).not.toHaveBeenCalled();
  });

  it('validates the entire 1C acknowledgement before touching stock or reservations', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 1,
      oneCId: '1c-order-1',
      oneCVersion: null,
      pickupLocationId: '40000000-0000-4000-8000-000000000001',
      grandTotal: new Prisma.Decimal('3500.00'),
      currency: 'RUB',
    };
    const item = {
      id: '50000000-0000-4000-8000-000000000001',
      variantId: '60000000-0000-4000-8000-000000000001',
      oneCVariantId: '1c-variant-1',
      quantity: new Prisma.Decimal('2'),
      unitPrice: new Prisma.Decimal('1750'),
      lineTotal: new Prisma.Decimal('3500'),
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([item]) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: '70000000-0000-4000-8000-000000000001',
          oneCId: '1c-warehouse-1',
          pickupLocationId: order.pickupLocationId,
          active: true,
        }),
      },
      stockReservation: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        create: jest.fn(),
      },
      stockBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '80000000-0000-4000-8000-000000000001',
            variantId: item.variantId,
            warehouseId: '70000000-0000-4000-8000-000000000001',
            available: new Prisma.Decimal('10'),
            sourceVersion: 'stock-1',
          },
        ]),
        update: jest.fn(),
      },
    };
    const transitions = { transitionInTransaction: jest.fn() };
    const service = new ReservationService(
      transactionHarness(tx) as never,
      new ReservationPolicyService(),
      transitions as never,
      { create: jest.fn() } as never,
    );

    await expect(
      service.confirmFromOneC({
        orderId: order.id,
        externalOrderId: '1c-order-1',
        orderVersion: 1,
        sourceVersion: 'order-1',
        confirmedTotal: '3499.99',
        currency: 'RUB',
        warehouseOneCId: '1c-warehouse-1',
        externalReservationId: 'reserve-1',
        expiresAt: new Date(Date.now() + 60_000),
        lines: [
          {
            externalVariantId: item.oneCVariantId,
            quantity: '2',
            confirmedUnitPrice: '1750.00',
            confirmedLineTotal: '3500.00',
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TOTAL_MISMATCH' }),
    });
    expect(tx.stockBalance.update).not.toHaveBeenCalled();
    expect(tx.stockReservation.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(transitions.transitionInTransaction).not.toHaveBeenCalled();
  });

  it('treats an exact repeated 1C confirmation as a no-op', async () => {
    const expiresAt = new Date('2026-07-26T12:00:00.000Z');
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'AWAITING_PAYMENT',
      version: 2,
      oneCId: '1c-order-1',
      oneCVersion: 7,
      reservationExpiresAt: expiresAt,
      pickupLocationId: '40000000-0000-4000-8000-000000000001',
      grandTotal: new Prisma.Decimal('3500.00'),
      currency: 'RUB',
    };
    const item = {
      id: '50000000-0000-4000-8000-000000000001',
      variantId: '60000000-0000-4000-8000-000000000001',
      oneCVariantId: '1c-variant-1',
      quantity: new Prisma.Decimal('2'),
      unitPrice: new Prisma.Decimal('1750'),
      lineTotal: new Prisma.Decimal('3500'),
    };
    const reservation = {
      id: '90000000-0000-4000-8000-000000000001',
      orderId: order.id,
      orderItemId: item.id,
      variantId: item.variantId,
      warehouseId: '70000000-0000-4000-8000-000000000001',
      quantity: new Prisma.Decimal('2'),
      status: 'ACTIVE',
      externalReservationId: 'reserve-1',
      sourceVersion: 'order-7',
      expiresAt,
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([item]) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: reservation.warehouseId,
          oneCId: '1c-warehouse-1',
          pickupLocationId: order.pickupLocationId,
          active: true,
        }),
      },
      stockReservation: {
        findMany: jest.fn().mockResolvedValue([reservation]),
        create: jest.fn(),
      },
      stockBalance: { findMany: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const transitions = { transitionInTransaction: jest.fn() };
    const outbox = { create: jest.fn() };
    const service = new ReservationService(
      transactionHarness(tx) as never,
      new ReservationPolicyService(),
      transitions as never,
      outbox as never,
    );

    await expect(
      service.confirmFromOneC({
        orderId: order.id,
        externalOrderId: order.oneCId,
        orderVersion: 7,
        sourceVersion: reservation.sourceVersion,
        confirmedTotal: '3500.00',
        currency: 'RUB',
        warehouseOneCId: '1c-warehouse-1',
        externalReservationId: reservation.externalReservationId,
        expiresAt,
        lines: [
          {
            externalVariantId: item.oneCVariantId,
            quantity: '2',
            confirmedUnitPrice: '1750.00',
            confirmedLineTotal: '3500.00',
          },
        ],
      }),
    ).resolves.toMatchObject({
      status: 'AWAITING_PAYMENT',
      orderVersion: 2,
      oneCVersion: 7,
      reservations: 1,
      duplicate: true,
    });
    expect(tx.stockBalance.findMany).not.toHaveBeenCalled();
    expect(tx.stockBalance.update).not.toHaveBeenCalled();
    expect(tx.stockReservation.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(transitions.transitionInTransaction).not.toHaveBeenCalled();
    expect(outbox.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a 1C confirmation for an order in an invalid state before changing stock', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      publicNumber: 'PD-20260725-00000001',
      status: 'CANCELLED_BY_STORE',
      version: 4,
      oneCId: '1c-order-1',
      oneCVersion: null,
      pickupLocationId: '40000000-0000-4000-8000-000000000001',
      grandTotal: new Prisma.Decimal('3500.00'),
      currency: 'RUB',
    };
    const item = {
      id: '50000000-0000-4000-8000-000000000001',
      variantId: '60000000-0000-4000-8000-000000000001',
      oneCVariantId: '1c-variant-1',
      quantity: new Prisma.Decimal('2'),
      unitPrice: new Prisma.Decimal('1750'),
      lineTotal: new Prisma.Decimal('3500'),
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: { findUnique: jest.fn().mockResolvedValue(order), update: jest.fn() },
      orderItem: { findMany: jest.fn().mockResolvedValue([item]) },
      warehouse: {
        findUnique: jest.fn().mockResolvedValue({
          id: '70000000-0000-4000-8000-000000000001',
          oneCId: '1c-warehouse-1',
          pickupLocationId: order.pickupLocationId,
          active: true,
        }),
      },
      stockReservation: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        create: jest.fn(),
      },
      stockBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: '80000000-0000-4000-8000-000000000001',
            variantId: item.variantId,
            warehouseId: '70000000-0000-4000-8000-000000000001',
            available: new Prisma.Decimal('10'),
            sourceVersion: 'stock-1',
          },
        ]),
        update: jest.fn(),
      },
    };
    const transitions = { transitionInTransaction: jest.fn() };
    const outbox = { create: jest.fn() };
    const service = new ReservationService(
      transactionHarness(tx) as never,
      new ReservationPolicyService(),
      transitions as never,
      outbox as never,
    );

    await expect(
      service.confirmFromOneC({
        orderId: order.id,
        externalOrderId: order.oneCId,
        orderVersion: 5,
        sourceVersion: 'order-5',
        confirmedTotal: '3500.00',
        currency: 'RUB',
        warehouseOneCId: '1c-warehouse-1',
        externalReservationId: 'reserve-1',
        expiresAt: new Date(Date.now() + 60_000),
        lines: [
          {
            externalVariantId: item.oneCVariantId,
            quantity: '2',
            confirmedUnitPrice: '1750.00',
            confirmedLineTotal: '3500.00',
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_AWAITING_STOCK' }),
    });
    expect(tx.stockBalance.update).not.toHaveBeenCalled();
    expect(tx.stockReservation.create).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(transitions.transitionInTransaction).not.toHaveBeenCalled();
    expect(outbox.create).not.toHaveBeenCalled();
  });
});
