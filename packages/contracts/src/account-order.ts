import type { CartView } from './cart.js';
import type { CatalogAvailability } from './catalog.js';
import type { PickupLocationView } from './checkout.js';
import type { FulfillmentMethod, OrderStatus, PaymentMethod } from './order.js';
import type { PaymentStatus } from './payment.js';

export interface AccountOrderSummary {
  readonly publicNumber: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: OrderStatus;
  readonly reservationExpiresAt: string | null;
  readonly grandTotal: string;
  readonly currency: 'RUB';
  /** Number of distinct order lines, rather than the sum of decimal quantities. */
  readonly itemCount: number;
  readonly fulfillmentMethod: Extract<FulfillmentMethod, 'PICKUP'>;
  readonly pickupName: string;
  readonly canRepeat: boolean;
}

export interface AccountFrequentItem {
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly productSlug: string | null;
  readonly productName: string;
  readonly offerName: string;
  readonly sku: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly totalQuantity: string;
  readonly orderCount: number;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}

export interface AccountOrdersOverview {
  readonly activeOrder: AccountOrderSummary | null;
  readonly lastOrder: AccountOrderSummary | null;
  readonly frequentItems: readonly AccountFrequentItem[];
}

export interface AccountOrdersPage {
  readonly items: readonly AccountOrderSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface AccountOrderItem {
  readonly id: string;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly productSlug: string | null;
  readonly sku: string;
  readonly productName: string;
  readonly brand: string | null;
  readonly offerName: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly oldUnitPrice: string | null;
  readonly lineSubtotal: string;
  readonly lineDiscount: string;
  readonly lineTotal: string;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}

export interface AccountOrderStatusEvent {
  readonly status: OrderStatus;
  readonly createdAt: string;
}

export interface AccountOrderDetail {
  readonly publicNumber: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: OrderStatus;
  readonly reservationExpiresAt: string | null;
  readonly desiredPickupAt: string | null;
  readonly fulfillmentMethod: Extract<FulfillmentMethod, 'PICKUP'>;
  readonly paymentMethod: Extract<PaymentMethod, 'BANK_TRANSFER'>;
  readonly paymentStatus: PaymentStatus | null;
  readonly pickup: PickupLocationView;
  readonly organization: {
    readonly name: string;
    readonly inn: string;
    readonly kpp: string | null;
  } | null;
  readonly items: readonly AccountOrderItem[];
  readonly totals: {
    readonly products: string;
    readonly discount: string;
    readonly grandTotal: string;
    readonly currency: 'RUB';
  };
  readonly history: readonly AccountOrderStatusEvent[];
  readonly canRepeat: boolean;
}

export const RepeatOrderItemState = {
  READY: 'READY',
  PRICE_CHANGED: 'PRICE_CHANGED',
  QUANTITY_ADJUSTED: 'QUANTITY_ADJUSTED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const;

export type RepeatOrderItemState = (typeof RepeatOrderItemState)[keyof typeof RepeatOrderItemState];

export interface RepeatOrderAlternative {
  readonly productId: string;
  readonly variantId: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly sku: string;
  readonly offerName: string;
  readonly packDescription: string | null;
  readonly unitPrice: string;
  readonly currency: 'RUB';
  readonly availability: CatalogAvailability;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
}

export interface RepeatOrderItem {
  readonly orderItemId: string;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly productSlug: string | null;
  readonly productName: string;
  readonly sku: string;
  readonly offerName: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly requestedQuantity: string;
  /** Quantity that will actually be merged into the current cart. Null means skipped. */
  readonly quantityToAdd: string | null;
  readonly sourceUnitPrice: string;
  readonly currentUnitPrice: string | null;
  readonly currentLineTotal: string | null;
  readonly availability: CatalogAvailability;
  readonly state: RepeatOrderItemState;
  readonly priceChanged: boolean;
  readonly quantityChanged: boolean;
  readonly reasonCodes: readonly string[];
  readonly alternatives: readonly RepeatOrderAlternative[];
}

export interface RepeatOrderPreview {
  readonly sourceOrder: AccountOrderSummary;
  readonly evaluatedAt: string;
  readonly items: readonly RepeatOrderItem[];
  readonly estimatedTotal: string;
  readonly currency: 'RUB';
  readonly canExecute: boolean;
  readonly hasChanges: boolean;
}

export interface RepeatOrderResult {
  readonly preview: RepeatOrderPreview;
  readonly cart: CartView;
  readonly replayed: boolean;
  readonly addedItemCount: number;
  readonly skippedItemCount: number;
}
