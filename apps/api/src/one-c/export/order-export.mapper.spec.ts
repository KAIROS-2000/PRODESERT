import { mapOrderToOneCExport, type OneCOrderExportRecord } from './order-export.mapper';

function orderFixture(): OneCOrderExportRecord {
  return {
    id: '0190f3ad-f7e1-7d68-b2d0-876e90e60d17',
    publicNumber: 'PD-20260718-ABCDEF12',
    customerId: null,
    guestName: 'Тестовый',
    guestSurname: 'Покупатель',
    guestPhone: '+79990000000',
    guestEmail: 'buyer@example.test',
    organizationData: {
      name: 'ООО Кондитер',
      inn: '5600000000',
      kpp: '560001001',
      ignoredSecret: 'must-not-leak',
    },
    fulfillmentMethod: 'PICKUP',
    pickupLocationCode: 'orenburg-lipovaya-20',
    paymentMethod: 'BANK_TRANSFER',
    customerComment: 'Позвонить перед готовностью',
    desiredPickupAt: new Date('2026-07-20T00:00:00.000Z'),
    currency: 'RUB',
    subtotal: '3500',
    discountTotal: '0',
    grandTotal: '3500',
    privacyConsentAt: new Date('2026-07-18T06:30:58.000Z'),
    orderTermsConsentAt: new Date('2026-07-18T06:30:58.000Z'),
    source: 'STOREFRONT',
    version: 1,
    createdAt: new Date('2026-07-18T06:31:00.000Z'),
    items: [
      {
        id: '0190f3ad-f841-796c-ad62-cc1c3fc15c85',
        oneCProductId: 'a1473c1f-1e3f-11ef-9a8d-00155d010101',
        oneCVariantId: 'a1473c20-1e3f-11ef-9a8d-00155d010101',
        sku: 'PD-000184',
        productName: 'Шоколад тёмный',
        brandName: 'Callebaut',
        offerName: 'Шоколад тёмный 54,5%, 1 кг',
        unit: 'шт.',
        quantity: '2',
        unitPrice: '1750',
        oldUnitPrice: '1890',
        lineDiscount: '0',
        vatRate: '20',
        lineTotal: '3500',
      },
    ],
  };
}

function keys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => keys(item));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, nested]) => [key, ...keys(nested)]);
}

describe('mapOrderToOneCExport', () => {
  it('exports an explicit pickup/bank-transfer allow-list without forbidden fields', () => {
    const command = mapOrderToOneCExport(orderFixture(), {
      messageId: '0190f3ad-f89e-7ab9-b782-8facfcbf9271',
      correlationId: '0190f3ad-f8b8-7dfb-8173-02822e3328a9',
      personalDataDocumentVersion: '2026-07-draft',
      orderTermsDocumentVersion: '2026-07-draft',
    });

    expect(command.payload.fulfillmentMethod).toBe('PICKUP');
    expect(command.payload.paymentMethod).toBe('BANK_TRANSFER');
    expect(command.payload.pickupLocationExternalId).toBe('orenburg-lipovaya-20');
    expect(command.payload.organization).toEqual({
      name: 'ООО Кондитер',
      inn: '5600000000',
      kpp: '560001001',
      contactName: 'Тестовый Покупатель',
    });
    expect(command.payload.lines[0]).toMatchObject({
      quantity: '2.000',
      unitPrice: '1750.00',
      oldUnitPrice: '1890.00',
      lineTotal: '3500.00',
    });

    const exportedKeys = keys(command).map((key) => key.toLowerCase());
    expect(exportedKeys).not.toEqual(
      expect.arrayContaining([
        'deliveryaddress',
        'shippingcost',
        'courier',
        'cardtoken',
        'bankdetails',
        'accountnumber',
        'bik',
        'publicaccesstokenhash',
        'internalcomment',
        'ignoredsecret',
      ]),
    );
  });
});
