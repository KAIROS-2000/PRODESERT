import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { type AuthenticatedPrincipal } from '../auth/auth.types';

export interface PaymentAccessOrder {
  customerId: string | null;
  publicAccessTokenHash: string | null;
  publicAccessTokenExpiresAt: Date | null;
}

@Injectable()
export class PublicOrderPaymentAccessService {
  normalizePublicNumber(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!/^PD-\d{8}-[A-F0-9]{8}$/.test(normalized)) throw this.notFound();
    return normalized;
  }

  bearerToken(authorization: string | undefined): string | undefined {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization ?? '');
    return match?.[1];
  }

  assertAccess(
    order: PaymentAccessOrder | null,
    rawAccessToken: string | undefined,
    principal: AuthenticatedPrincipal | undefined,
    now = new Date(),
  ): asserts order is PaymentAccessOrder {
    if (!order) throw this.notFound();
    const ownerSession = Boolean(principal && order.customerId === principal.userId);
    if (!ownerSession && !this.guestTokenValid(order, rawAccessToken, now)) {
      throw this.notFound();
    }
  }

  notFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND_OR_ACCESS_DENIED',
      message: 'Заказ не найден или ссылка доступа недействительна.',
    });
  }

  private guestTokenValid(order: PaymentAccessOrder, raw: string | undefined, now: Date): boolean {
    if (
      !raw ||
      !order.publicAccessTokenHash ||
      !order.publicAccessTokenExpiresAt ||
      order.publicAccessTokenExpiresAt.getTime() <= now.getTime()
    ) {
      return false;
    }
    const actual = Buffer.from(createHash('sha256').update(raw, 'utf8').digest('hex'), 'utf8');
    const expected = Buffer.from(order.publicAccessTokenHash, 'utf8');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
