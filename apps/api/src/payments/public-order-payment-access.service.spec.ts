import { createHash } from 'node:crypto';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { PublicOrderPaymentAccessService } from './public-order-payment-access.service';

describe('PublicOrderPaymentAccessService', () => {
  const access = new PublicOrderPaymentAccessService();
  const raw = 'a'.repeat(43);
  const order = {
    customerId: null,
    publicAccessTokenHash: createHash('sha256').update(raw).digest('hex'),
    publicAccessTokenExpiresAt: new Date('2026-07-26T00:00:00.000Z'),
  };

  it('accepts a live guest bearer without returning token material', () => {
    expect(() =>
      access.assertAccess(order, raw, undefined, new Date('2026-07-25T00:00:00.000Z')),
    ).not.toThrow();
  });

  it('uses the same generic not-found response for invalid access', () => {
    expect(() =>
      access.assertAccess(order, 'b'.repeat(43), undefined, new Date('2026-07-25T00:00:00.000Z')),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'ORDER_NOT_FOUND_OR_ACCESS_DENIED' }),
      }),
    );
  });

  it('accepts the authenticated owner without a bearer', () => {
    const principal = { userId: 'user-1' } as AuthenticatedPrincipal;
    expect(() =>
      access.assertAccess(
        { ...order, customerId: 'user-1' },
        undefined,
        principal,
        new Date('2026-07-25T00:00:00.000Z'),
      ),
    ).not.toThrow();
  });
});
