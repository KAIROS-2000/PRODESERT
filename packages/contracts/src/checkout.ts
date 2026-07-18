import type { CartNotice, CartView } from './cart.js';
import type { FulfillmentMethod, OrderStatus, PaymentMethod } from './order.js';

export interface CheckoutOrganizationInput {
  readonly name: string;
  readonly inn: string;
  readonly kpp?: string;
}

export interface CheckoutInput {
  /** Cart revision last shown to the customer. Must come from CartView.updatedAt. */
  readonly cartUpdatedAt: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone: string;
  readonly email: string;
  readonly privacyConsent: boolean;
  readonly orderTermsConsent: boolean;
  readonly comment?: string;
  /** Calendar date in YYYY-MM-DD format. */
  readonly desiredPickupAt?: string;
  readonly organization?: CheckoutOrganizationInput;
}

export type CheckoutField =
  | 'firstName'
  | 'phone'
  | 'email'
  | 'privacyConsent'
  | 'orderTermsConsent'
  | 'desiredPickupAt'
  | 'organization'
  | 'cart';

export interface CheckoutFieldError {
  readonly field: CheckoutField;
  readonly code: string;
  readonly message: string;
}

export interface PickupLocationView {
  readonly code: string;
  readonly name: string;
  readonly addressText: string;
  readonly timezone: string;
  readonly phone: string | null;
  readonly openingHours: unknown | null;
}

export interface CheckoutValidationResult {
  readonly valid: boolean;
  readonly cart: CartView;
  readonly pickup: PickupLocationView;
  readonly fulfillmentMethod: Extract<FulfillmentMethod, 'PICKUP'>;
  readonly paymentMethod: Extract<PaymentMethod, 'BANK_TRANSFER'>;
  readonly notices: readonly CartNotice[];
  readonly fieldErrors: readonly CheckoutFieldError[];
}

export interface OrderCreatedView {
  readonly publicNumber: string;
  readonly status: Extract<OrderStatus, 'AWAITING_STOCK_CONFIRMATION'>;
  /** Returned for a guest order. Keep it private; it cannot be recovered from the order number. */
  readonly accessToken?: string;
  readonly createdAt: string;
  readonly grandTotal: string;
  readonly currency: 'RUB';
  readonly pickup: PickupLocationView;
  readonly message: string;
}

export interface PublicOrderItemView {
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

export interface PublicOrderStatusHistoryView {
  readonly status: OrderStatus;
  readonly createdAt: string;
}

export interface PublicOrderView {
  readonly publicNumber: string;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly customer: {
    readonly firstName: string;
    readonly lastName: string | null;
    readonly email: string;
    readonly phone: string;
  };
  readonly desiredPickupAt: string | null;
  readonly fulfillmentMethod: Extract<FulfillmentMethod, 'PICKUP'>;
  readonly paymentMethod: Extract<PaymentMethod, 'BANK_TRANSFER'>;
  readonly pickup: PickupLocationView;
  readonly items: readonly PublicOrderItemView[];
  readonly totals: {
    readonly products: string;
    readonly discount: string;
    readonly grandTotal: string;
    readonly currency: 'RUB';
  };
  readonly history: readonly PublicOrderStatusHistoryView[];
  readonly message: string;
}
