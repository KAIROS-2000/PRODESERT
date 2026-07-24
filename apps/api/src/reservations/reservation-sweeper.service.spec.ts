import { ReservationSweeperService } from './reservation-sweeper.service';

describe('ReservationSweeperService', () => {
  it('sweeps each due order once even when the service observes duplicates', async () => {
    const findMany = jest.fn().mockResolvedValue([{ orderId: 'order-1' }, { orderId: 'order-2' }]);
    const expire = jest
      .fn()
      .mockResolvedValueOnce({
        orderId: 'order-1',
        status: 'RESERVATION_EXPIRED',
        reservationsReleased: 2,
        duplicate: false,
      })
      .mockResolvedValueOnce({
        orderId: 'order-2',
        status: 'RESERVATION_EXPIRED',
        reservationsReleased: 0,
        duplicate: true,
      });
    const sweeper = new ReservationSweeperService(
      { stockReservation: { findMany } } as never,
      { expire } as never,
    );
    const now = new Date('2026-07-26T12:00:00.000Z');

    await expect(sweeper.sweep(now)).resolves.toEqual({ examined: 2, expired: 1, failed: 0 });
    expect(expire).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE', expiresAt: { lte: now } }),
        distinct: ['orderId'],
      }),
    );
  });

  it('continues after one order fails so another reservation is not stranded', async () => {
    const findMany = jest.fn().mockResolvedValue([{ orderId: 'order-1' }, { orderId: 'order-2' }]);
    const expire = jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce({
      orderId: 'order-2',
      status: 'RESERVATION_EXPIRED',
      reservationsReleased: 1,
      duplicate: false,
    });
    const sweeper = new ReservationSweeperService(
      { stockReservation: { findMany } } as never,
      { expire } as never,
    );

    await expect(sweeper.sweep()).resolves.toEqual({ examined: 2, expired: 1, failed: 1 });
    expect(expire).toHaveBeenCalledTimes(2);
  });
});
