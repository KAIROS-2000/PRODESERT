import { Injectable } from '@nestjs/common';
import { type OneCCatalogBatch, oneCCatalogBatchSchema } from './one-c-catalog.types';

@Injectable()
export class MockOneCCatalogAdapter {
  load(scenario: 'BASELINE' | 'PRICE_STOCK_UPDATE'): OneCCatalogBatch {
    const isUpdate = scenario === 'PRICE_STOCK_UPDATE';
    return oneCCatalogBatchSchema.parse({
      sourceVersion: isUpdate ? 'mock-catalog-v2' : 'mock-catalog-v1',
      warehouse: {
        oneCId: '40000000-0000-4000-8000-000000000001',
        code: 'ORENBURG-LIPOVAYA',
        name: 'Основной склад магазина на Липовой',
        active: true,
      },
      products: [
        {
          oneCId: '10000000-0000-4000-8000-000000000001',
          baseName: 'Шоколад тёмный профессиональный 54,5%',
          active: true,
          oneCGroupId: '1c-chocolate-couverture',
          brand: {
            oneCId: '30000000-0000-4000-8000-000000000001',
            name: 'Callebaut',
            active: true,
          },
          attributes: [
            {
              code: 'cocoa_percent',
              name: 'Содержание какао',
              dataType: 'NUMBER',
              value: 54.5,
              displayValue: '54,5%',
              unit: '%',
            },
            {
              code: 'form',
              name: 'Форма выпуска',
              dataType: 'ENUM',
              value: 'callets',
              displayValue: 'Каллеты',
            },
            {
              code: 'professional_usage',
              name: 'Профессиональное применение',
              dataType: 'TEXT',
              value: 'Темперирование, корпусные конфеты и ганаш',
              displayValue: 'Темперирование, корпусные конфеты и ганаш',
            },
            {
              code: 'requires_tempering',
              name: 'Требует темперирования',
              dataType: 'BOOLEAN',
              value: true,
              displayValue: 'Да',
            },
          ],
          variants: [
            {
              oneCId: '20000000-0000-4000-8000-000000000001',
              sku: 'CB-811-2500',
              offerName: 'Шоколад тёмный 54,5%, 2,5 кг',
              packDescription: 'Пакет 2,5 кг',
              unit: 'шт',
              vatRate: 20,
              minOrderQuantity: 1,
              salesMultiple: 1,
              countryOfOrigin: 'Бельгия',
              manufacturer: 'Barry Callebaut',
              shelfLifeDays: 540,
              storageConditions: 'Хранить при температуре от +12 до +20 °C',
              allowBackorder: false,
              active: true,
              price: {
                amount: isUpdate ? 4290 : 4390,
                oldAmount: isUpdate ? 4590 : null,
                currency: 'RUB',
                vatIncluded: true,
              },
              stock: {
                onHand: isUpdate ? 18 : 12,
                reserved: isUpdate ? 2 : 1,
                available: isUpdate ? 16 : 11,
              },
            },
          ],
        },
      ],
    });
  }
}
