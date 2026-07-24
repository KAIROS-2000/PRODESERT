import { type OrderStatus, type StatusSource } from '@prisma/client';

export interface OrderTransition {
  to: OrderStatus;
  sources: readonly StatusSource[];
}

const ANY_INTERNAL_SOURCE = ['ADMIN', 'ONE_C', 'SYSTEM'] as const satisfies readonly StatusSource[];
const STORE_OR_CUSTOMER = [
  'ADMIN',
  'ONE_C',
  'STOREFRONT',
] as const satisfies readonly StatusSource[];

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderTransition[]>> = {
  DRAFT: [{ to: 'CREATED', sources: ['STOREFRONT', 'SYSTEM'] }],
  CREATED: [
    {
      to: 'AWAITING_STOCK_CONFIRMATION',
      sources: ['STOREFRONT', 'SYSTEM'],
    },
    { to: 'CANCELLED_BY_CUSTOMER', sources: ['STOREFRONT'] },
    { to: 'CANCELLED_BY_STORE', sources: ANY_INTERNAL_SOURCE },
  ],
  AWAITING_STOCK_CONFIRMATION: [
    // A manager requests confirmation, but only a 1C acknowledgement establishes
    // the commercial fact and is therefore allowed to make this transition.
    { to: 'AWAITING_PAYMENT', sources: ['ONE_C'] },
    { to: 'CANCELLED_BY_CUSTOMER', sources: ['STOREFRONT'] },
    { to: 'CANCELLED_BY_STORE', sources: ANY_INTERNAL_SOURCE },
  ],
  AWAITING_PAYMENT: [
    { to: 'PAYMENT_VERIFICATION', sources: ['STOREFRONT'] },
    { to: 'PAID', sources: ['ADMIN', 'ONE_C'] },
    { to: 'CANCELLED_BY_CUSTOMER', sources: ['STOREFRONT'] },
    { to: 'CANCELLED_BY_STORE', sources: ['ADMIN', 'ONE_C'] },
    { to: 'RESERVATION_EXPIRED', sources: ['ONE_C', 'SYSTEM'] },
  ],
  PAYMENT_VERIFICATION: [
    { to: 'AWAITING_PAYMENT', sources: ['ADMIN', 'ONE_C'] },
    { to: 'PAID', sources: ['ADMIN', 'ONE_C'] },
    { to: 'CANCELLED_BY_CUSTOMER', sources: ['STOREFRONT'] },
    { to: 'CANCELLED_BY_STORE', sources: ['ADMIN', 'ONE_C'] },
    { to: 'RESERVATION_EXPIRED', sources: ['ONE_C', 'SYSTEM'] },
  ],
  PAID: [
    { to: 'ASSEMBLING', sources: ['ADMIN', 'ONE_C'] },
    { to: 'RETURN_REQUESTED', sources: STORE_OR_CUSTOMER },
  ],
  ASSEMBLING: [
    { to: 'READY_FOR_PICKUP', sources: ['ADMIN', 'ONE_C'] },
    { to: 'RETURN_REQUESTED', sources: ['ADMIN', 'ONE_C'] },
  ],
  READY_FOR_PICKUP: [
    { to: 'COMPLETED', sources: ['ADMIN', 'ONE_C'] },
    { to: 'RETURN_REQUESTED', sources: STORE_OR_CUSTOMER },
  ],
  COMPLETED: [{ to: 'RETURN_REQUESTED', sources: STORE_OR_CUSTOMER }],
  RETURN_REQUESTED: [{ to: 'RETURNED', sources: ['ADMIN', 'ONE_C'] }],
  CANCELLED_BY_CUSTOMER: [],
  CANCELLED_BY_STORE: [],
  RESERVATION_EXPIRED: [],
  RETURNED: [],
};

export class InvalidOrderTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    readonly source: StatusSource,
  ) {
    super(`Order transition ${from} -> ${to} is not allowed for ${source}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

export function isOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  source: StatusSource,
): boolean {
  return ORDER_TRANSITIONS[from].some(
    (transition) => transition.to === to && transition.sources.includes(source),
  );
}

export function assertOrderTransitionAllowed(
  from: OrderStatus,
  to: OrderStatus,
  source: StatusSource,
): void {
  if (!isOrderTransitionAllowed(from, to, source)) {
    throw new InvalidOrderTransitionError(from, to, source);
  }
}

export function allowedOrderTransitions(
  from: OrderStatus,
  source: StatusSource,
): readonly OrderStatus[] {
  return ORDER_TRANSITIONS[from]
    .filter((transition) => transition.sources.includes(source))
    .map((transition) => transition.to);
}
