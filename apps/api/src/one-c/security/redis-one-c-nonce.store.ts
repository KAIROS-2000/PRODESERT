import { Injectable } from '@nestjs/common';
import { RedisService } from '../../queue/redis.service';
import { type OneCNonceClaim, type OneCNonceStore } from './one-c-nonce-store';

/**
 * Cluster-safe replay protection. RedisService implements the atomic
 * SET key value EX ttl NX operation and fails closed when Redis is unavailable.
 */
@Injectable()
export class RedisOneCNonceStore implements OneCNonceStore {
  constructor(private readonly redis: RedisService) {}

  async claim(keyId: string, nonce: string, expiresAt: Date): Promise<OneCNonceClaim> {
    const remainingMilliseconds = expiresAt.getTime() - Date.now();
    if (!Number.isFinite(remainingMilliseconds) || remainingMilliseconds <= 0) {
      return 'REPLAY';
    }
    const ttlSeconds = Math.max(1, Math.ceil(remainingMilliseconds / 1_000));
    const storageKey = `pro-dessert:one-c:nonce:${encodeURIComponent(keyId)}:${encodeURIComponent(nonce)}`;
    return (await this.redis.reserveNonce(storageKey, ttlSeconds)) ? 'CLAIMED' : 'REPLAY';
  }
}
