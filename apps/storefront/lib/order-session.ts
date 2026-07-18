import { OrderStatus, type OrderCreatedView } from '@pro-dessert/contracts';

type StoredOrderSummary = Omit<OrderCreatedView, 'accessToken'>;

const lastOrderKey = 'pro-dessert:last-created-order';
const orderAccessPrefix = 'pro-dessert:guest-order-access:';
let volatileLastOrderSnapshot: string | null = null;
const volatileOrderAccess = new Map<string, string>();

function isStoredOrderSummary(value: unknown): value is StoredOrderSummary {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.publicNumber === 'string' &&
    record.status === OrderStatus.AWAITING_STOCK_CONFIRMATION &&
    typeof record.createdAt === 'string' &&
    typeof record.grandTotal === 'string' &&
    record.currency === 'RUB' &&
    typeof record.message === 'string' &&
    typeof record.pickup === 'object' &&
    record.pickup !== null
  );
}

function accessKey(publicNumber: string): string {
  return `${orderAccessPrefix}${publicNumber}`;
}

export function rememberCreatedOrder(order: OrderCreatedView): void {
  const { accessToken, ...summary } = order;
  volatileLastOrderSnapshot = JSON.stringify(summary);
  if (accessToken) volatileOrderAccess.set(order.publicNumber, accessToken);

  try {
    sessionStorage.setItem(lastOrderKey, volatileLastOrderSnapshot);
    if (accessToken) sessionStorage.setItem(accessKey(order.publicNumber), accessToken);
  } catch {
    // In-memory fallback keeps the confirmation usable until this page is reloaded.
  }
}

export function readLastCreatedOrder(): StoredOrderSummary | null {
  return parseCreatedOrderSnapshot(readLastCreatedOrderSnapshot());
}

export function readLastCreatedOrderSnapshot(): string | null {
  try {
    return sessionStorage.getItem(lastOrderKey) ?? volatileLastOrderSnapshot;
  } catch {
    return volatileLastOrderSnapshot;
  }
}

export function parseCreatedOrderSnapshot(raw: string | null): StoredOrderSummary | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isStoredOrderSummary(value) ? value : null;
  } catch {
    return null;
  }
}

export function readOrderAccessToken(publicNumber: string): string | null {
  try {
    return (
      sessionStorage.getItem(accessKey(publicNumber)) ??
      volatileOrderAccess.get(publicNumber) ??
      null
    );
  } catch {
    return volatileOrderAccess.get(publicNumber) ?? null;
  }
}
