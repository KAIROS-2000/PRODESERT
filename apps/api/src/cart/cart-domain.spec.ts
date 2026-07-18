import { Prisma } from '@prisma/client';
import {
  calculateLineTotals,
  checkoutRequestHash,
  greatestValidQuantity,
  isValidSalesQuantity,
  resolveStockQuantity,
  validateCheckoutFields,
} from './cart-domain';
import { type CheckoutDto } from '../checkout/dto/checkout.dto';

const decimal = (value: string): Prisma.Decimal => new Prisma.Decimal(value);

const validCheckout: CheckoutDto = {
  cartUpdatedAt: '2026-07-17T00:00:00.000Z',
  firstName: 'Анна',
  phone: '+7 912 345-67-89',
  email: 'anna@example.test',
  privacyConsent: true,
  orderTermsConsent: true,
};

describe('cart domain', () => {
  it('calculates products, discount and line total from the immutable price inputs', () => {
    const totals = calculateLineTotals(decimal('1750'), decimal('2000'), decimal('2.5'));
    expect({
      products: totals.lineSubtotal.toFixed(2),
      discount: totals.lineDiscount.toFixed(2),
      total: totals.lineTotal.toFixed(2),
      unitDiscount: totals.unitDiscount.toFixed(2),
    }).toEqual({
      products: '5000.00',
      discount: '625.00',
      total: '4375.00',
      unitDiscount: '250.00',
    });
  });

  it('enforces minimum and sales multiple', () => {
    expect(isValidSalesQuantity(decimal('2'), decimal('2'), decimal('0.5'))).toBe(true);
    expect(isValidSalesQuantity(decimal('2.25'), decimal('2'), decimal('0.5'))).toBe(false);
    expect(isValidSalesQuantity(decimal('1.5'), decimal('2'), decimal('0.5'))).toBe(false);
  });

  it('reduces ordinary stock to the greatest valid multiple', () => {
    expect(
      greatestValidQuantity(decimal('5'), decimal('3.7'), decimal('1'), decimal('0.5'))?.toString(),
    ).toBe('3.5');
  });

  it('does not cap a valid backorder quantity by current stock', () => {
    expect(
      resolveStockQuantity(
        decimal('6'),
        decimal('0'),
        decimal('1'),
        decimal('1'),
        true,
      )?.toString(),
    ).toBe('6');
    expect(
      resolveStockQuantity(decimal('6'), decimal('0'), decimal('1'), decimal('1'), false),
    ).toBeNull();
  });

  it('reports checkout consents and a past pickup date', () => {
    const errors = validateCheckoutFields(
      {
        ...validCheckout,
        privacyConsent: false,
        orderTermsConsent: false,
        desiredPickupAt: '2026-07-17',
      },
      'Asia/Yekaterinburg',
      new Date('2026-07-18T12:00:00.000Z'),
    );
    expect(errors.map((error) => error.field)).toEqual([
      'privacyConsent',
      'orderTermsConsent',
      'desiredPickupAt',
    ]);
  });

  it('requires 10 to 15 phone digits after formatting is removed', () => {
    const symbolsOnly = validateCheckoutFields(
      { ...validCheckout, phone: '() () () ()' },
      'Asia/Yekaterinburg',
    );
    const tooShort = validateCheckoutFields(
      { ...validCheckout, phone: '+7 (123) 45-67' },
      'Asia/Yekaterinburg',
    );
    const valid = validateCheckoutFields(validCheckout, 'Asia/Yekaterinburg');
    expect(symbolsOnly.some((error) => error.field === 'phone')).toBe(true);
    expect(tooShort.some((error) => error.field === 'phone')).toBe(true);
    expect(valid.some((error) => error.field === 'phone')).toBe(false);
  });

  it('rejects blank or malformed organization data', () => {
    const errors = validateCheckoutFields(
      {
        ...validCheckout,
        organization: { name: '   ', inn: '123', kpp: 'ABC' },
      },
      'Asia/Yekaterinburg',
    );
    expect(errors).toContainEqual(
      expect.objectContaining({ field: 'organization', code: 'ORGANIZATION_INVALID' }),
    );
  });

  it('hashes normalized checkout requests deterministically', () => {
    const first = checkoutRequestHash({ ...validCheckout, email: ' Anna@Example.Test ' });
    const same = checkoutRequestHash({ ...validCheckout, email: 'anna@example.test' });
    const changed = checkoutRequestHash({ ...validCheckout, comment: 'Позвонить заранее' });
    expect(first).toBe(same);
    expect(changed).not.toBe(first);
  });
});
