import { ReservationExpiryProcessor } from './reservation-expiry.processor';

describe('ReservationExpiryProcessor', () => {
  it('delegates an at-least-once job to the idempotent domain service', async () => {
    const expire = jest.fn().mockResolvedValue({
      orderId: 'order-1',
      status: 'RESERVATION_EXPIRED',
      reservationsReleased: 1,
      duplicate: false,
    });
    const processor = new ReservationExpiryProcessor({ expire } as never);
    const now = new Date('2026-07-26T12:00:00.000Z');

    await expect(
      processor.process(
        {
          data: {
            orderId: 'order-1',
            reservationExpiresAt: '2026-07-26T11:59:00.000Z',
            correlationId: 'job-1',
          },
        },
        now,
      ),
    ).resolves.toMatchObject({ status: 'RESERVATION_EXPIRED' });
    expect(expire).toHaveBeenCalledWith('order-1', now, 'job-1');
  });

  it('rejects malformed job data so BullMQ can retry or dead-letter it', async () => {
    const processor = new ReservationExpiryProcessor({ expire: jest.fn() } as never);
    await expect(
      processor.process({
        data: {
          orderId: 'order-1',
          reservationExpiresAt: 'not-a-date',
          correlationId: 'job-2',
        },
      }),
    ).rejects.toThrow('invalid reservationExpiresAt');
  });
});
