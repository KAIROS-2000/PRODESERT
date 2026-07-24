import { ReservationExtensionService } from './reservation-extension.service';

const now = new Date('2026-07-25T08:00:00.000Z');
const currentExpiry = new Date('2026-07-26T08:00:00.000Z');
const extendedExpiry = new Date('2026-07-27T08:00:00.000Z');

function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'order-1',
    publicNumber: 'PD-20260725-AABBCCDD',
    version: 7,
    status: 'AWAITING_PAYMENT',
    oneCId: '1c-order-1',
    oneCVersion: 3,
    reservationExpiresAt: currentExpiry,
    organizationData: null,
    pickupLocationTimezone: 'Asia/Yekaterinburg',
    ...overrides,
  };
}

function activeReservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'reservation-1',
    orderId: 'order-1',
    externalReservationId: '1c-reservation-1',
    expiresAt: currentExpiry,
    ...overrides,
  };
}

function harness(currentOrder = order()): {
  service: ReservationExtensionService;
  tx: {
    $queryRaw: jest.Mock;
    order: { findUnique: jest.Mock; update: jest.Mock };
    stockReservation: { findMany: jest.Mock; updateMany: jest.Mock };
    outboxEvent: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  outboxCreate: jest.Mock;
} {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn().mockResolvedValue(currentOrder),
      update: jest.fn().mockResolvedValue({
        ...currentOrder,
        version: 8,
        oneCVersion: 4,
        reservationExpiresAt: extendedExpiry,
      }),
    },
    stockReservation: {
      findMany: jest.fn().mockResolvedValue([activeReservation()]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: { findUnique: jest.fn().mockResolvedValue(null) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'DEFAULT_RESERVATION_HOURS') return 24;
      if (key === 'B2B_RESERVATION_BUSINESS_DAYS') return 3;
      return undefined;
    }),
  };
  const outboxCreate = jest.fn().mockResolvedValue({ messageId: 'message-1', createdAt: now });
  return {
    service: new ReservationExtensionService(
      prisma as never,
      config as never,
      { create: outboxCreate } as never,
    ),
    tx,
    outboxCreate,
  };
}

describe('ReservationExtensionService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('queues an extension request without changing the reservation deadline locally', async () => {
    const { service, tx, outboxCreate } = harness();

    const result = await service.request({
      orderId: 'order-1',
      expectedVersion: 7,
      actorUserId: 'manager-1',
      actorRole: 'MANAGER',
      reason: 'Клиент запросил дополнительное время',
      correlationId: 'correlation-1',
    });

    expect(result.currentExpiresAt).toBe(currentExpiry.toISOString());
    expect(result.requestedExpiresAt).toBe(extendedExpiry.toISOString());
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.stockReservation.updateMany).not.toHaveBeenCalled();
    expect(outboxCreate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'order.reservation_extension.requested',
        payload: expect.objectContaining({
          orderVersion: 7,
          requestedExpiresAt: extendedExpiry.toISOString(),
        }),
      }),
    );
  });

  it('rejects a stale optimistic order version before publishing a 1C command', async () => {
    const { service, tx, outboxCreate } = harness();

    await expect(
      service.request({
        orderId: 'order-1',
        expectedVersion: 6,
        actorUserId: 'manager-1',
        actorRole: 'MANAGER',
        reason: 'Клиент запросил дополнительное время',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_VERSION_CONFLICT',
        details: { expectedVersion: 6, actualVersion: 7 },
      }),
    });
    expect(tx.stockReservation.findMany).not.toHaveBeenCalled();
    expect(outboxCreate).not.toHaveBeenCalled();
  });

  it('updates both order and active reservations only after the 1C acknowledgement', async () => {
    const { service, tx, outboxCreate } = harness();

    const result = await service.applyFromOneC({
      orderId: 'order-1',
      externalOrderId: '1c-order-1',
      externalReservationId: '1c-reservation-1',
      oneCVersion: 4,
      sourceVersion: 'stock-v4',
      expiresAt: extendedExpiry,
      eventId: 'event-extension-4',
      correlationId: 'correlation-1',
    });

    expect(tx.stockReservation.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', status: 'ACTIVE' },
      data: {
        expiresAt: extendedExpiry,
        sourceVersion: 'stock-v4',
        correlationId: 'correlation-1',
      },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: {
        oneCVersion: 4,
        reservationExpiresAt: extendedExpiry,
        version: { increment: 1 },
      },
    });
    expect(result).toEqual({
      orderId: 'order-1',
      orderVersion: 8,
      oneCVersion: 4,
      reservationExpiresAt: extendedExpiry.toISOString(),
      duplicate: false,
    });
    expect(outboxCreate).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        eventType: 'order.reservation_extended',
        causationId: 'event-extension-4',
      }),
    );
  });

  it('rejects a stale 1C acknowledgement without mutating the deadline', async () => {
    const { service, tx, outboxCreate } = harness();

    await expect(
      service.applyFromOneC({
        orderId: 'order-1',
        externalOrderId: '1c-order-1',
        externalReservationId: '1c-reservation-1',
        oneCVersion: 3,
        sourceVersion: 'stock-v3',
        expiresAt: extendedExpiry,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'RESERVATION_EXTENSION_STALE_OR_INVALID',
      }),
    });
    expect(tx.stockReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(outboxCreate).not.toHaveBeenCalled();
  });
});
