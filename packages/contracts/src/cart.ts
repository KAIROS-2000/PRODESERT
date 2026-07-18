import type { CatalogAvailability, CatalogImage, CatalogProductSummary } from './catalog.js';

export interface CartTotals {
  /** Sum before item-level discounts. */
  readonly products: string;
  readonly discount: string;
  readonly grandTotal: string;
  readonly currency: 'RUB';
}

export interface CartItemIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: 'WARNING' | 'BLOCKING';
}

export interface CartNotice {
  readonly code: string;
  readonly message: string;
  readonly itemId?: string;
}

export interface CartItemView {
  readonly id: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly brand: string | null;
  readonly variantId: string;
  readonly sku: string;
  readonly offerName: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly quantity: string;
  readonly minOrderQuantity: string;
  readonly salesMultiple: string;
  readonly unitPrice: string;
  readonly oldUnitPrice: string | null;
  readonly lineSubtotal: string;
  readonly lineDiscount: string;
  readonly lineTotal: string;
  readonly currency: 'RUB';
  readonly image: CatalogImage | null;
  readonly availability: CatalogAvailability;
  readonly active: boolean;
  readonly issues: readonly CartItemIssue[];
}

export interface CartView {
  readonly items: readonly CartItemView[];
  readonly recommendations: readonly CatalogProductSummary[];
  readonly totals: CartTotals;
  readonly notices: readonly CartNotice[];
  readonly canCheckout: boolean;
  readonly itemCount: number;
  readonly updatedAt: string;
}

export interface AddCartItemInput {
  readonly variantId: string;
  /** Decimal serialized as a string, with at most three fractional digits. */
  readonly quantity: string;
}

export interface UpdateCartItemInput {
  /** Decimal serialized as a string, with at most three fractional digits. */
  readonly quantity: string;
}
