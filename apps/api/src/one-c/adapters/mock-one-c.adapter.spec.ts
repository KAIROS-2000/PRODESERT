import {
  mapOrderToOneCExport,
  type OneCExportOrderCommand,
  type OneCOrderExportRecord,
} from '../export/order-export.mapper';
import { MockOneCAdapter, OneCAdapterConflictError } from './mock-one-c.adapter';

function commandFixture(): OneCExportOrderCommand {
  const order: OneCOrderExportRecord = {
    id: 'order-id',
    publicNumber: 'PD-20260718-ABCDEF12',
    customerId: null,
    guestName: 'Тест',
    guestSurname: null,
    guestPhone: '+79990000000',
    guestEmail: 'buyer@example.test',
    organizationData: null,
    fulfillmentMethod: 'PICKUP',
    pickupLocationCode: 'orenburg-lipovaya-20',
    paymentMethod: 'BANK_TRANSFER',
    customerComment: null,
    desiredPickupAt: null,
    currency: 'RUB',
    subtotal: '100',
    discountTotal: '0',
    grandTotal: '100',
    privacyConsentAt: new Date('2026-07-18T00:00:00.000Z'),
    orderTermsConsentAt: new Date('2026-07-18T00:00:00.000Z'),
    source: 'STOREFRONT',
    version: 1,
    createdAt: new Date('2026-07-18T00:00:01.000Z'),
    items: [
      {
        id: 'line-id',
        oneCProductId: 'product-id',
        oneCVariantId: 'variant-id',
        sku: 'SKU-1',
        productName: 'Товар',
        brandName: null,
        offerName: 'Товар, 1 кг',
        unit: 'шт.',
        quantity: '1',
        unitPrice: '100',
        oldUnitPrice: null,
        lineDiscount: '0',
        vatRate: '20',
        lineTotal: '100',
      },
    ],
  };
  return mapOrderToOneCExport(order, {
    messageId: 'message-id',
    correlationId: 'correlation-id',
    personalDataDocumentVersion: 'v1',
    orderTermsDocumentVersion: 'v1',
  });
}

describe('MockOneCAdapter', () => {
  it('returns the same receipt for the same idempotency key and payload', async () => {
    const adapter = new MockOneCAdapter();
    const command = commandFixture();
    const first = await adapter.pushOrder(command);
    const repeated = await adapter.pushOrder(command);
    expect(repeated).toBe(first);
  });

  it('rejects the same idempotency key with a different payload', async () => {
    const adapter = new MockOneCAdapter();
    const command = commandFixture();
    await adapter.pushOrder(command);
    const changed = {
      ...command,
      payload: { ...command.payload, grandTotal: '101.00' },
    };
    await expect(adapter.pushOrder(changed)).rejects.toBeInstanceOf(OneCAdapterConflictError);
  });
});
