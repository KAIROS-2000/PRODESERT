export const ONE_C_NONCE_STORE = Symbol('ONE_C_NONCE_STORE');

export type OneCNonceClaim = 'CLAIMED' | 'REPLAY';

/**
 * Implementations must claim a nonce atomically (for Redis: SET NX PX).
 * Throwing means the replay control is unavailable; callers fail closed.
 */
export interface OneCNonceStore {
  claim(keyId: string, nonce: string, expiresAt: Date): Promise<OneCNonceClaim>;
}

/** Test/development implementation. Production registration must supply Redis. */
export class InMemoryOneCNonceStore implements OneCNonceStore {
  private readonly claims = new Map<string, number>();

  async claim(keyId: string, nonce: string, expiresAt: Date): Promise<OneCNonceClaim> {
    const now = Date.now();
    for (const [key, expiration] of this.claims) {
      if (expiration <= now) {
        this.claims.delete(key);
      }
    }

    const storageKey = `${keyId}:${nonce}`;
    const current = this.claims.get(storageKey);
    if (current !== undefined && current > now) {
      return 'REPLAY';
    }
    this.claims.set(storageKey, expiresAt.getTime());
    return 'CLAIMED';
  }
}
