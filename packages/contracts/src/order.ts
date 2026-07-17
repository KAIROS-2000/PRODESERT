export const FulfillmentMethod = {
  PICKUP: 'PICKUP',
} as const;

export type FulfillmentMethod = (typeof FulfillmentMethod)[keyof typeof FulfillmentMethod];

export const PaymentMethod = {
  BANK_TRANSFER: 'BANK_TRANSFER',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const OrderStatus = {
  DRAFT: 'DRAFT',
  CREATED: 'CREATED',
  AWAITING_STOCK_CONFIRMATION: 'AWAITING_STOCK_CONFIRMATION',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAYMENT_VERIFICATION: 'PAYMENT_VERIFICATION',
  PAID: 'PAID',
  ASSEMBLING: 'ASSEMBLING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  COMPLETED: 'COMPLETED',
  CANCELLED_BY_CUSTOMER: 'CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_STORE: 'CANCELLED_BY_STORE',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  RETURNED: 'RETURNED',
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const StatusSource = {
  STOREFRONT: 'STOREFRONT',
  ADMIN: 'ADMIN',
  ONE_C: 'ONE_C',
  SYSTEM: 'SYSTEM',
} as const;

export type StatusSource = (typeof StatusSource)[keyof typeof StatusSource];
