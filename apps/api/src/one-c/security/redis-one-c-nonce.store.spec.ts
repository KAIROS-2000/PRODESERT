import { RedisOneCNonceStore } from './redis-one-c-nonce.store';

describe('RedisOneCNonceStore', () => {
  it('uses one atomic NX reservation and maps an existing key to replay', async () => {
    const reserveNonce = jest.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const store = new RedisOneCNonceStore({ reserveNonce } as never);
    const expiresAt = new Date(Date.now() + 60_000);

    await expect(store.claim('key-v1', 'nonce-0000000001', expiresAt)).resolves.toBe('CLAIMED');
    await expect(store.claim('key-v1', 'nonce-0000000001', expiresAt)).resolves.toBe('REPLAY');
    expect(reserveNonce).toHaveBeenCalledTimes(2);
    expect(reserveNonce.mock.calls[0]?.[0]).toBe('pro-dessert:one-c:nonce:key-v1:nonce-0000000001');
    expect(reserveNonce.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(59);
  });

  it('fails closed for an already expired claim without touching Redis', async () => {
    const reserveNonce = jest.fn();
    const store = new RedisOneCNonceStore({ reserveNonce } as never);
    await expect(store.claim('key-v1', 'nonce-0000000001', new Date(Date.now() - 1))).resolves.toBe(
      'REPLAY',
    );
    expect(reserveNonce).not.toHaveBeenCalled();
  });
});
