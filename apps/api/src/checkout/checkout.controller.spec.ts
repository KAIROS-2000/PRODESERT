import { BadRequestException } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { CheckoutController } from './checkout.controller';
import { type CheckoutDto } from './dto/checkout.dto';

describe('CheckoutController', () => {
  const dto: CheckoutDto = {
    cartUpdatedAt: '2026-07-17T00:00:00.000Z',
    firstName: 'Анна',
    phone: '+79123456789',
    email: 'anna@example.test',
    privacyConsent: true,
    orderTermsConsent: true,
  };

  it('rejects order creation without an Idempotency-Key before touching the cart', async () => {
    const controller = new CheckoutController({} as never, {} as never, {} as never, {} as never);
    await expect(
      controller.create(dto, undefined, {} as Request, {} as Response),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
