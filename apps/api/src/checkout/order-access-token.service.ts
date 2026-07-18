import { createHash, createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Environment } from '../common/config/environment';

@Injectable()
export class OrderAccessTokenService {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  derive(orderId: string): string {
    return createHmac('sha256', this.secret)
      .update(`pro-dessert:guest-order:${orderId}`, 'utf8')
      .digest('base64url');
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  private get secret(): string {
    return (
      this.config.get('ORDER_ACCESS_TOKEN_SECRET', { infer: true }) ??
      this.config.get('PII_HASH_SECRET', { infer: true }) ??
      'development-only-order-access-secret-change-before-production'
    );
  }
}
