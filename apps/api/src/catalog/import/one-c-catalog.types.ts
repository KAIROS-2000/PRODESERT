import { z } from 'zod';

const uuid = z.string().uuid();
const decimal = z.number().finite().nonnegative();
const attributeBase = z.object({
  code: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  name: z.string().min(1).max(200),
  displayValue: z.string().min(1).max(300),
  unit: z.string().max(32).optional(),
});
const oneCAttributeSchema = z.discriminatedUnion('dataType', [
  attributeBase.extend({
    dataType: z.literal('ENUM'),
    value: z
      .string()
      .min(1)
      .max(300)
      .refine((value) => value.normalize('NFKC').toLowerCase().length <= 300, {
        message: 'Normalized ENUM value must fit attribute_values.normalized_value',
      }),
  }),
  attributeBase.extend({ dataType: z.literal('TEXT'), value: z.string().min(1).max(1000) }),
  attributeBase.extend({ dataType: z.literal('NUMBER'), value: z.number().finite() }),
  attributeBase.extend({ dataType: z.literal('BOOLEAN'), value: z.boolean() }),
]);

export const oneCCatalogBatchSchema = z.object({
  sourceVersion: z.string().min(1).max(120),
  warehouse: z.object({
    oneCId: uuid,
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    active: z.boolean(),
  }),
  products: z.array(
    z.object({
      oneCId: uuid,
      baseName: z.string().min(1).max(300),
      active: z.boolean(),
      oneCGroupId: z.string().min(1).max(120),
      brand: z.object({
        oneCId: uuid,
        name: z.string().min(1).max(200),
        active: z.boolean(),
      }),
      attributes: z.array(oneCAttributeSchema),
      variants: z.array(
        z.object({
          oneCId: uuid,
          sku: z.string().min(1).max(100),
          offerName: z.string().min(1).max(300),
          packDescription: z.string().max(300).optional(),
          unit: z.string().min(1).max(32),
          vatRate: z.number().min(0).max(100),
          minOrderQuantity: z.number().positive(),
          salesMultiple: z.number().positive(),
          countryOfOrigin: z.string().max(120).optional(),
          manufacturer: z.string().max(200).optional(),
          shelfLifeDays: z.number().int().positive().optional(),
          storageConditions: z.string().max(500).optional(),
          allowBackorder: z.boolean(),
          active: z.boolean(),
          price: z.object({
            amount: decimal,
            oldAmount: decimal.nullable(),
            currency: z.literal('RUB'),
            vatIncluded: z.boolean(),
          }),
          stock: z.object({
            onHand: decimal,
            reserved: decimal,
            available: decimal,
          }),
        }),
      ),
    }),
  ),
});

export type OneCCatalogBatch = z.infer<typeof oneCCatalogBatchSchema>;
export type OneCProduct = OneCCatalogBatch['products'][number];

export interface CommercialProductProjection {
  readonly baseName: string;
  readonly active: boolean;
  readonly oneCSourceVersion: string;
  readonly oneCLastSyncedAt: Date;
}

/** Only these fields may appear in the update branch for an existing product. */
export function commercialProductUpdate(
  product: OneCProduct,
  sourceVersion: string,
): CommercialProductProjection {
  return {
    baseName: product.baseName,
    active: product.active,
    oneCSourceVersion: sourceVersion,
    oneCLastSyncedAt: new Date(),
  } as const;
}
