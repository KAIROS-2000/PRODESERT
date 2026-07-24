import { OrderTransitionService } from './order-transition.service';

function transactionHarness(tx: Record<string, unknown>): { $transaction: jest.Mock } {
  return {
    $transaction: jest.fn((callback: (client: unknown) => unknown) => callback(tx)),
  };
}

describe('OrderTransitionService', () => {
  it('rejects a transition whose source is not authoritative', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 3,
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      orderStatusHistory: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new OrderTransitionService(transactionHarness(tx) as never);

    await expect(
      service.transition({
        orderId: order.id,
        toStatus: 'AWAITING_PAYMENT',
        source: 'ADMIN',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_TRANSITION_NOT_ALLOWED',
        details: {
          fromStatus: 'AWAITING_STOCK_CONFIRMATION',
          toStatus: 'AWAITING_PAYMENT',
          source: 'ADMIN',
        },
      }),
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects an optimistic-lock mismatch before evaluating the transition', async () => {
    const order = {
      id: '10000000-0000-4000-8000-000000000001',
      status: 'AWAITING_STOCK_CONFIRMATION',
      version: 4,
    };
    const tx = {
      $queryRaw: jest.fn(),
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      orderStatusHistory: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const service = new OrderTransitionService(transactionHarness(tx) as never);

    await expect(
      service.transition({
        orderId: order.id,
        toStatus: 'AWAITING_PAYMENT',
        source: 'ONE_C',
        expectedVersion: 3,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_VERSION_CONFLICT',
        details: { expectedVersion: 3, actualVersion: 4 },
      }),
    });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
