import { Prisma } from '@prisma/client';
import type {
  CatalogAvailability,
  RepeatOrderItemState as RepeatState,
} from '@pro-dessert/contracts';
import { classifyAvailability } from '../catalog/catalog-domain';
import { money } from '../cart/cart-domain';

const repeatState = {
  READY: 'READY',
  PRICE_CHANGED: 'PRICE_CHANGED',
  QUANTITY_ADJUSTED: 'QUANTITY_ADJUSTED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const satisfies Record<string, RepeatState>;

export interface RepeatOrderCandidate {
  readonly productActive: boolean;
  readonly variantActive: boolean;
  readonly sourceQuantity: Prisma.Decimal;
  readonly sourceUnitPrice: Prisma.Decimal;
  readonly currentUnitPrice: Prisma.Decimal | null;
  readonly minOrderQuantity: Prisma.Decimal;
  readonly salesMultiple: Prisma.Decimal;
  readonly available: Prisma.Decimal;
  readonly allowBackorder: boolean;
  readonly existingCartQuantity: Prisma.Decimal;
}

export interface RepeatOrderEvaluation {
  readonly state: RepeatState;
  readonly availability: CatalogAvailability;
  readonly quantityToAdd: Prisma.Decimal | null;
  readonly currentLineTotal: Prisma.Decimal | null;
  readonly priceChanged: boolean;
  readonly quantityChanged: boolean;
  readonly reasonCodes: readonly string[];
}

/**
 * Re-evaluates an immutable order line against current merchandising data.
 *
 * The target is the final cart quantity, not only the repeated increment. This
 * keeps a merge valid if minimum/multiple rules changed while the customer
 * already has the same variant in the cart.
 */
export function evaluateRepeatOrderCandidate(
  candidate: RepeatOrderCandidate,
): RepeatOrderEvaluation {
  const availability = classifyAvailability(
    candidate.available.toNumber(),
    candidate.allowBackorder,
  );
  const reasonCodes: string[] = [];

  if (!candidate.productActive) reasonCodes.push('PRODUCT_INACTIVE');
  if (!candidate.variantActive) reasonCodes.push('VARIANT_INACTIVE');
  const currentUnitPrice = candidate.currentUnitPrice;
  if (currentUnitPrice === null) {
    return {
      state: repeatState.UNAVAILABLE,
      availability,
      quantityToAdd: null,
      currentLineTotal: null,
      priceChanged: false,
      quantityChanged: false,
      reasonCodes: [...reasonCodes, 'PRICE_UNAVAILABLE'],
    };
  }

  const priceChanged = !currentUnitPrice.equals(candidate.sourceUnitPrice);

  if (reasonCodes.length > 0) {
    return {
      state: repeatState.UNAVAILABLE,
      availability,
      quantityToAdd: null,
      currentLineTotal: null,
      priceChanged,
      quantityChanged: false,
      reasonCodes,
    };
  }

  const desiredTotal = candidate.existingCartQuantity.plus(candidate.sourceQuantity);
  const normalizedTotal = roundUpToMultiple(
    Prisma.Decimal.max(desiredTotal, candidate.minOrderQuantity),
    candidate.salesMultiple,
  );
  const capacity = candidate.allowBackorder
    ? normalizedTotal
    : roundDownToMultiple(candidate.available, candidate.salesMultiple);
  const finalTotal = candidate.allowBackorder
    ? normalizedTotal
    : Prisma.Decimal.min(normalizedTotal, capacity);

  if (
    finalTotal.lessThan(candidate.minOrderQuantity) ||
    finalTotal.lessThanOrEqualTo(candidate.existingCartQuantity)
  ) {
    return {
      state: repeatState.UNAVAILABLE,
      availability,
      quantityToAdd: null,
      currentLineTotal: null,
      priceChanged,
      quantityChanged: false,
      reasonCodes: [...reasonCodes, 'INSUFFICIENT_STOCK'],
    };
  }

  const quantityToAdd = finalTotal.minus(candidate.existingCartQuantity);
  const quantityChanged = !quantityToAdd.equals(candidate.sourceQuantity);
  if (!normalizedTotal.equals(desiredTotal)) reasonCodes.push('QUANTITY_RULE_CHANGED');
  if (quantityChanged) reasonCodes.push('QUANTITY_ADJUSTED_TO_STOCK');
  if (priceChanged) reasonCodes.push('PRICE_CHANGED');

  const state = quantityChanged
    ? repeatState.QUANTITY_ADJUSTED
    : priceChanged
      ? repeatState.PRICE_CHANGED
      : repeatState.READY;

  return {
    state,
    availability,
    quantityToAdd,
    currentLineTotal: money(currentUnitPrice.times(quantityToAdd)),
    priceChanged,
    quantityChanged,
    reasonCodes,
  };
}

function roundUpToMultiple(value: Prisma.Decimal, multiple: Prisma.Decimal): Prisma.Decimal {
  return value.dividedBy(multiple).ceil().times(multiple);
}

function roundDownToMultiple(value: Prisma.Decimal, multiple: Prisma.Decimal): Prisma.Decimal {
  return value.dividedToIntegerBy(multiple).times(multiple);
}
