import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Environment } from '../../common/config/environment';
import { type OneCHmacKeyStore } from './one-c-signature.service';

/**
 * One active inbound key is configured in v1. The key id is explicit so key
 * rotation can be performed by deploying the new id/secret pair before 1C
 * starts signing with it. Unknown ids never fall back to another secret.
 */
@Injectable()
export class ConfiguredOneCHmacKeyStore implements OneCHmacKeyStore {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  async resolve(keyId: string): Promise<string | null> {
    if (keyId !== this.config.get('ONE_C_KEY_ID', { infer: true })) {
      return null;
    }
    return this.config.get('ONE_C_INBOUND_HMAC_SECRET', { infer: true }) ?? null;
  }
}
