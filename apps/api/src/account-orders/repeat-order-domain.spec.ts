import { Prisma } from '@prisma/client';
import { evaluateRepeatOrderCandidate, type RepeatOrderCandidate } from './repeat-order-domain';

const decimal = (value: string | number): Prisma.Decimal => new Prisma.Decimal(value);

function candidate(overrides: Partial<RepeatOrderCandidate> = {}): RepeatOrderCandidate {
  return {
    productActive: true,
    variantActive: true,
    sourceQuantity: decimal(2),
    sourceUnitPrice: decimal(100),
    currentUnitPrice: decimal(100),
    minOrderQuantity: decimal(1),
    salesMultiple: decimal(1),
    available: decimal(20),
    allowBackorder: false,
    existingCartQuantity: decimal(0),
    ...overrides,
  };
}

describe('evaluateRepeatOrderCandidate', () => {
  it('keeps a valid line ready at the current price', () => {
    const result = evaluateRepeatOrderCandidate(candidate());

    expect(result).toMatchObject({
      state: 'READY',
      availability: 'IN_STOCK',
      priceChanged: false,
      quantityChanged: false,
      reasonCodes: [],
    });
    expect(result.quantityToAdd?.toString()).toBe('2');
    expect(result.currentLineTotal?.toFixed(2)).toBe('200.00');
  });

  it('reports a current price change without copying the source price', () => {
    const result = evaluateRepeatOrderCandidate(
      candidate({ sourceUnitPrice: decimal(80), currentUnitPrice: decimal(105.5) }),
    );

    expect(result.state).toBe('PRICE_CHANGED');
    expect(result.priceChanged).toBe(true);
    expect(result.reasonCodes).toContain('PRICE_CHANGED');
    expect(result.currentLineTotal?.toFixed(2)).toBe('211.00');
  });

  it('normalizes the final merged quantity when sales rules changed', () => {
    const result = evaluateRepeatOrderCandidate(
      candidate({
        sourceQuantity: decimal(3),
        minOrderQuantity: decimal(2),
        salesMultiple: decimal(2),
      }),
    );

    expect(result.state).toBe('QUANTITY_ADJUSTED');
    expect(result.quantityToAdd?.toString()).toBe('4');
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(['QUANTITY_RULE_CHANGED', 'QUANTITY_ADJUSTED_TO_STOCK']),
    );
  });

  it('merges with an existing cart line and caps only the repeat increment', () => {
    const result = evaluateRepeatOrderCandidate(
      candidate({
        sourceQuantity: decimal(4),
        existingCartQuantity: decimal(2),
        available: decimal(5),
      }),
    );

    expect(result.state).toBe('QUANTITY_ADJUSTED');
    expect(result.quantityToAdd?.toString()).toBe('3');
    expect(result.currentLineTotal?.toFixed(2)).toBe('300.00');
  });

  it('skips a line when current stock cannot produce a valid final quantity', () => {
    const result = evaluateRepeatOrderCandidate(
      candidate({
        sourceQuantity: decimal(2),
        minOrderQuantity: decimal(2),
        available: decimal(1),
      }),
    );

    expect(result.state).toBe('UNAVAILABLE');
    expect(result.quantityToAdd).toBeNull();
    expect(result.reasonCodes).toContain('INSUFFICIENT_STOCK');
  });

  it('allows an explicit backorder while still exposing its availability class', () => {
    const result = evaluateRepeatOrderCandidate(
      candidate({ available: decimal(0), allowBackorder: true }),
    );

    expect(result.state).toBe('READY');
    expect(result.availability).toBe('BACKORDER');
    expect(result.quantityToAdd?.toString()).toBe('2');
  });

  it.each([
    [{ productActive: false }, 'PRODUCT_INACTIVE'],
    [{ variantActive: false }, 'VARIANT_INACTIVE'],
    [{ currentUnitPrice: null }, 'PRICE_UNAVAILABLE'],
  ] as const)('does not repeat unavailable catalog data: %s', (overrides, reason) => {
    const result = evaluateRepeatOrderCandidate(candidate(overrides));

    expect(result.state).toBe('UNAVAILABLE');
    expect(result.quantityToAdd).toBeNull();
    expect(result.reasonCodes).toContain(reason);
  });
});
