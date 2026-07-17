import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { AttributeDataType, Prisma, type Warehouse } from '@prisma/client';
import { type CatalogImportResult } from '@pro-dessert/contracts';
import { AuditService } from '../../audit/audit.service';
import { type AuthenticatedPrincipal } from '../../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { MockOneCCatalogAdapter } from './mock-one-c.adapter';
import {
  assertCatalogProjectionRevision,
  compareCatalogSourceVersions,
  EqualCatalogVersionConflictError,
  normalizeEnumAttributeValue,
  StaleCatalogVersionError,
  toAttributeAssignmentColumns,
  type OneCAttribute,
} from './catalog-import-domain';
import {
  commercialProductUpdate,
  type OneCCatalogBatch,
  type OneCProduct,
} from './one-c-catalog.types';

export { compareCatalogSourceVersions } from './catalog-import-domain';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

const TRANSLITERATION: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function slugifyCatalogValue(value: string): string {
  const transliterated = [...value.normalize('NFKC').toLowerCase()]
    .map((character) => TRANSLITERATION[character] ?? character)
    .join('');
  return (
    transliterated
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 280) || 'catalog-item'
  );
}

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapter: MockOneCCatalogAdapter,
    private readonly audit: AuditService,
  ) {}

  async runMockImport(
    scenario: 'BASELINE' | 'PRICE_STOCK_UPDATE',
    principal: AuthenticatedPrincipal,
  ): Promise<CatalogImportResult> {
    const importId = randomUUID();
    const batch = this.adapter.load(scenario);
    const variantCount = batch.products.reduce(
      (count, product) => count + product.variants.length,
      0,
    );

    try {
      await this.runSerializableImport(batch);
    } catch (error: unknown) {
      if (error instanceof StaleCatalogVersionError) {
        await this.audit.record({
          action: 'catalog.mock_import.rejected_stale_version',
          entityType: 'CatalogImport',
          entityId: importId,
          actorUserId: principal.userId,
          actorRole: principal.role,
          source: 'ADMIN',
          metadata: {
            incomingVersion: error.incomingVersion,
            currentVersion: error.currentVersion,
            projectionKey: error.projectionKey,
          },
        });
        throw new ConflictException('Версия выгрузки 1С устарела');
      }
      if (error instanceof EqualCatalogVersionConflictError) {
        await this.audit.record({
          action: 'catalog.mock_import.rejected_equal_version_conflict',
          entityType: 'CatalogImport',
          entityId: importId,
          actorUserId: principal.userId,
          actorRole: principal.role,
          source: 'ADMIN',
          metadata: {
            incomingVersion: error.incomingVersion,
            projectionKey: error.projectionKey,
          },
        });
        throw new ConflictException('Версия выгрузки 1С уже применена с другими данными');
      }
      throw error;
    }

    const completedAt = new Date();
    await this.audit.record({
      action: 'catalog.mock_import.completed',
      entityType: 'CatalogImport',
      entityId: importId,
      actorUserId: principal.userId,
      actorRole: principal.role,
      source: 'ADMIN',
      metadata: {
        adapter: 'mock-1c',
        scenario,
        sourceVersion: batch.sourceVersion,
        productsProcessed: batch.products.length,
        variantsProcessed: variantCount,
      },
    });

    return {
      importId,
      sourceVersion: batch.sourceVersion,
      productsProcessed: batch.products.length,
      variantsProcessed: variantCount,
      completedAt: completedAt.toISOString(),
    };
  }

  private async runSerializableImport(batch: OneCCatalogBatch): Promise<void> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (transaction) => {
            const warehouse = await this.upsertWarehouse(transaction, batch);
            for (const product of batch.products) {
              await this.assertProductCanApply(
                transaction,
                product,
                batch.sourceVersion,
                warehouse.id,
              );
            }
            for (const product of batch.products) {
              await this.upsertProduct(transaction, product, batch.sourceVersion, warehouse.id);
            }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        return;
      } catch (error: unknown) {
        if (!isRetryableTransactionConflict(error) || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  private async assertProductCanApply(
    transaction: Prisma.TransactionClient,
    source: OneCProduct,
    sourceVersion: string,
    warehouseId: string,
  ): Promise<void> {
    const current = await transaction.product.findUnique({
      where: { oneCId: source.oneCId },
      select: {
        baseName: true,
        active: true,
        oneCSourceVersion: true,
        brand: { select: { oneCId: true, name: true, active: true } },
        attributeValues: {
          where: { variantId: null, oneCSourceVersion: { not: null } },
          select: {
            oneCSourceVersion: true,
            textValue: true,
            numericValue: true,
            booleanValue: true,
            definition: {
              select: { code: true, name: true, dataType: true, unit: true },
            },
            value: { select: { normalizedValue: true, displayValue: true } },
          },
        },
        variants: {
          where: { oneCSourceVersion: { not: null } },
          select: {
            oneCId: true,
            sku: true,
            offerName: true,
            packDescription: true,
            unit: true,
            vatRate: true,
            minOrderQuantity: true,
            salesMultiple: true,
            countryOfOrigin: true,
            manufacturer: true,
            shelfLifeDays: true,
            storageConditions: true,
            allowBackorder: true,
            active: true,
            sortOrder: true,
            oneCSourceVersion: true,
            prices: {
              where: { priceType: 'RETAIL' },
              take: 1,
              select: {
                amount: true,
                oldAmount: true,
                currency: true,
                vatIncluded: true,
                sourceVersion: true,
              },
            },
            stockBalances: {
              where: { warehouseId },
              take: 1,
              select: {
                onHand: true,
                reserved: true,
                available: true,
                sourceVersion: true,
              },
            },
          },
        },
      },
    });
    if (current === null) {
      return;
    }

    assertCatalogProjectionRevision({
      incomingVersion: sourceVersion,
      currentVersion: current.oneCSourceVersion,
      projectionKey: `product:${source.oneCId}`,
      incomingProjection: {
        baseName: source.baseName,
        active: source.active,
        brand: {
          oneCId: source.brand.oneCId,
          name: source.brand.name,
          active: source.brand.active,
        },
      },
      currentProjection: {
        baseName: current.baseName,
        active: current.active,
        brand:
          current.brand === null
            ? null
            : {
                oneCId: current.brand.oneCId,
                name: current.brand.name,
                active: current.brand.active,
              },
      },
    });

    const currentAttributes = new Map(
      current.attributeValues.map((assignment) => [assignment.definition.code, assignment]),
    );
    for (const sourceAttribute of source.attributes) {
      const assignment = currentAttributes.get(sourceAttribute.code);
      assertCatalogProjectionRevision({
        incomingVersion: sourceVersion,
        currentVersion: assignment?.oneCSourceVersion ?? current.oneCSourceVersion,
        projectionKey: `product:${source.oneCId}:attribute:${sourceAttribute.code}`,
        incomingProjection: attributeProjectionFromSource(sourceAttribute),
        currentProjection:
          assignment === undefined ? null : attributeProjectionFromDatabase(assignment),
      });
    }

    const sourceAttributeCodes = new Set(source.attributes.map((attribute) => attribute.code));
    for (const assignment of current.attributeValues) {
      if (
        !sourceAttributeCodes.has(assignment.definition.code) &&
        assignment.oneCSourceVersion !== null &&
        compareCatalogSourceVersions(sourceVersion, assignment.oneCSourceVersion) === 0
      ) {
        throw new EqualCatalogVersionConflictError(
          sourceVersion,
          `product:${source.oneCId}:attribute:${assignment.definition.code}`,
        );
      }
    }

    const currentVariants = new Map(current.variants.map((variant) => [variant.oneCId, variant]));
    for (const [sortOrder, sourceVariant] of source.variants.entries()) {
      const variant = currentVariants.get(sourceVariant.oneCId);
      assertCatalogProjectionRevision({
        incomingVersion: sourceVersion,
        currentVersion: variant?.oneCSourceVersion ?? current.oneCSourceVersion,
        projectionKey: `variant:${sourceVariant.oneCId}`,
        incomingProjection: variantProjectionFromSource(sourceVariant, sortOrder),
        currentProjection: variant === undefined ? null : variantProjectionFromDatabase(variant),
      });

      const currentPrice = variant?.prices[0];
      assertCatalogProjectionRevision({
        incomingVersion: sourceVersion,
        currentVersion:
          currentPrice?.sourceVersion ?? variant?.oneCSourceVersion ?? current.oneCSourceVersion,
        projectionKey: `price:${sourceVariant.oneCId}:RETAIL`,
        incomingProjection: priceProjectionFromSource(sourceVariant.price),
        currentProjection:
          currentPrice === undefined ? null : priceProjectionFromDatabase(currentPrice),
      });

      const currentStock = variant?.stockBalances[0];
      assertCatalogProjectionRevision({
        incomingVersion: sourceVersion,
        currentVersion:
          currentStock?.sourceVersion ?? variant?.oneCSourceVersion ?? current.oneCSourceVersion,
        projectionKey: `stock:${sourceVariant.oneCId}:${warehouseId}`,
        incomingProjection: stockProjectionFromSource(sourceVariant.stock),
        currentProjection:
          currentStock === undefined ? null : stockProjectionFromDatabase(currentStock),
      });
    }

    const sourceVariantIds = new Set(source.variants.map((variant) => variant.oneCId));
    for (const variant of current.variants) {
      if (
        !sourceVariantIds.has(variant.oneCId) &&
        variant.oneCSourceVersion !== null &&
        compareCatalogSourceVersions(sourceVersion, variant.oneCSourceVersion) === 0
      ) {
        throw new EqualCatalogVersionConflictError(sourceVersion, `variant:${variant.oneCId}`);
      }
    }
  }

  private async upsertWarehouse(
    transaction: Prisma.TransactionClient,
    batch: OneCCatalogBatch,
  ): Promise<Warehouse> {
    const pickupLocation = await transaction.pickupLocation.findFirst({
      where: { code: 'orenburg-lipovaya-20', active: true },
      select: { id: true },
    });
    return transaction.warehouse.upsert({
      where: { oneCId: batch.warehouse.oneCId },
      update: {
        code: batch.warehouse.code,
        name: batch.warehouse.name,
        active: batch.warehouse.active,
        ...(pickupLocation ? { pickupLocationId: pickupLocation.id } : {}),
      },
      create: {
        ...batch.warehouse,
        ...(pickupLocation ? { pickupLocationId: pickupLocation.id } : {}),
      },
    });
  }

  private async upsertProduct(
    transaction: Prisma.TransactionClient,
    source: OneCProduct,
    sourceVersion: string,
    warehouseId: string,
  ): Promise<void> {
    const now = new Date();
    const brand = await transaction.brand.upsert({
      where: { oneCId: source.brand.oneCId },
      update: { name: source.brand.name, active: source.brand.active },
      create: {
        oneCId: source.brand.oneCId,
        name: source.brand.name,
        active: source.brand.active,
        slug: `${slugifyCatalogValue(source.brand.name)}-${source.brand.oneCId.slice(0, 8)}`,
      },
    });

    const product = await transaction.product.upsert({
      where: { oneCId: source.oneCId },
      update: {
        ...commercialProductUpdate(source, sourceVersion),
        brandId: brand.id,
      },
      create: {
        oneCId: source.oneCId,
        baseName: source.baseName,
        brandId: brand.id,
        active: source.active,
        oneCSourceVersion: sourceVersion,
        oneCLastSyncedAt: now,
        slug: `${slugifyCatalogValue(source.baseName)}-${source.oneCId.slice(0, 8)}`,
      },
    });

    const mapping = await transaction.categoryNormalizationMapping.findUnique({
      where: { oneCGroupId: source.oneCGroupId },
    });
    if (mapping?.active) {
      const existingPrimary = await transaction.productCategory.findFirst({
        where: { productId: product.id, isPrimary: true },
        select: { categoryId: true },
      });
      await transaction.productCategory.upsert({
        where: { productId_categoryId: { productId: product.id, categoryId: mapping.categoryId } },
        update: {},
        create: {
          productId: product.id,
          categoryId: mapping.categoryId,
          isPrimary: existingPrimary === null,
        },
      });
      await transaction.categoryNormalizationMapping.update({
        where: { id: mapping.id },
        data: { lastSeenAt: now, sourceName: mapping.sourceName },
      });
    }

    await this.upsertAttributes(transaction, product.id, source, sourceVersion);
    for (const [sortOrder, sourceVariant] of source.variants.entries()) {
      const variant = await transaction.productVariant.upsert({
        where: { oneCId: sourceVariant.oneCId },
        update: {
          productId: product.id,
          sku: sourceVariant.sku,
          offerName: sourceVariant.offerName,
          packDescription: sourceVariant.packDescription ?? null,
          unit: sourceVariant.unit,
          vatRate: sourceVariant.vatRate,
          minOrderQuantity: sourceVariant.minOrderQuantity,
          salesMultiple: sourceVariant.salesMultiple,
          countryOfOrigin: sourceVariant.countryOfOrigin ?? null,
          manufacturer: sourceVariant.manufacturer ?? null,
          shelfLifeDays: sourceVariant.shelfLifeDays ?? null,
          storageConditions: sourceVariant.storageConditions ?? null,
          allowBackorder: sourceVariant.allowBackorder,
          active: sourceVariant.active,
          sortOrder,
          oneCSourceVersion: sourceVersion,
          oneCLastSyncedAt: now,
        },
        create: {
          productId: product.id,
          oneCId: sourceVariant.oneCId,
          sku: sourceVariant.sku,
          offerName: sourceVariant.offerName,
          packDescription: sourceVariant.packDescription,
          unit: sourceVariant.unit,
          vatRate: sourceVariant.vatRate,
          minOrderQuantity: sourceVariant.minOrderQuantity,
          salesMultiple: sourceVariant.salesMultiple,
          countryOfOrigin: sourceVariant.countryOfOrigin,
          manufacturer: sourceVariant.manufacturer,
          shelfLifeDays: sourceVariant.shelfLifeDays,
          storageConditions: sourceVariant.storageConditions,
          allowBackorder: sourceVariant.allowBackorder,
          active: sourceVariant.active,
          sortOrder,
          oneCSourceVersion: sourceVersion,
          oneCLastSyncedAt: now,
        },
      });
      const oldAmount =
        sourceVariant.price.oldAmount !== null &&
        sourceVariant.price.oldAmount > sourceVariant.price.amount
          ? sourceVariant.price.oldAmount
          : null;
      await transaction.price.upsert({
        where: { variantId_priceType: { variantId: variant.id, priceType: 'RETAIL' } },
        update: {
          amount: sourceVariant.price.amount,
          oldAmount,
          currency: sourceVariant.price.currency,
          vatIncluded: sourceVariant.price.vatIncluded,
          sourceVersion,
          lastSyncedAt: now,
        },
        create: {
          variantId: variant.id,
          priceType: 'RETAIL',
          amount: sourceVariant.price.amount,
          oldAmount,
          currency: sourceVariant.price.currency,
          vatIncluded: sourceVariant.price.vatIncluded,
          sourceVersion,
          lastSyncedAt: now,
        },
      });
      await transaction.stockBalance.upsert({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId } },
        update: {
          ...sourceVariant.stock,
          sourceVersion,
          asOf: now,
        },
        create: {
          variantId: variant.id,
          warehouseId,
          ...sourceVariant.stock,
          sourceVersion,
          asOf: now,
        },
      });
    }
  }

  private async upsertAttributes(
    transaction: Prisma.TransactionClient,
    productId: string,
    source: OneCProduct,
    sourceVersion: string,
  ): Promise<void> {
    for (const [sortOrder, sourceAttribute] of source.attributes.entries()) {
      const definition = await transaction.attributeDefinition.upsert({
        where: { code: sourceAttribute.code },
        update: {
          name: sourceAttribute.name,
          dataType: sourceAttribute.dataType as AttributeDataType,
          unit: sourceAttribute.unit ?? null,
          active: true,
        },
        create: {
          code: sourceAttribute.code,
          name: sourceAttribute.name,
          dataType: sourceAttribute.dataType as AttributeDataType,
          unit: sourceAttribute.unit,
          filterable: true,
          sortOrder,
        },
      });
      let enumValueId: string | null = null;
      if (sourceAttribute.dataType === 'ENUM') {
        const normalizedValue = normalizeEnumAttributeValue(sourceAttribute.value);
        const value = await transaction.attributeValue.upsert({
          where: {
            definitionId_normalizedValue: {
              definitionId: definition.id,
              normalizedValue,
            },
          },
          update: {
            displayValue: sourceAttribute.displayValue,
            numericValue: null,
            booleanValue: null,
          },
          create: {
            definitionId: definition.id,
            normalizedValue,
            displayValue: sourceAttribute.displayValue,
            numericValue: null,
            booleanValue: null,
            sortOrder,
          },
        });
        enumValueId = value.id;
      }
      const typedColumns = toAttributeAssignmentColumns(sourceAttribute, enumValueId);
      const assignment = await transaction.productAttributeValue.findFirst({
        where: { productId, definitionId: definition.id },
        select: { id: true },
      });
      if (assignment) {
        await transaction.productAttributeValue.update({
          where: { id: assignment.id },
          data: {
            ...typedColumns,
            oneCSourceVersion: sourceVersion,
          },
        });
      } else {
        await transaction.productAttributeValue.create({
          data: {
            productId,
            definitionId: definition.id,
            ...typedColumns,
            oneCSourceVersion: sourceVersion,
          },
        });
      }
    }
  }
}

type OneCVariant = OneCProduct['variants'][number];
type OneCPrice = OneCVariant['price'];
type OneCStock = OneCVariant['stock'];

interface DatabaseAttributeAssignment {
  readonly textValue: string | null;
  readonly numericValue: Prisma.Decimal | null;
  readonly booleanValue: boolean | null;
  readonly definition: {
    readonly code: string;
    readonly name: string;
    readonly dataType: AttributeDataType;
    readonly unit: string | null;
  };
  readonly value: { readonly normalizedValue: string; readonly displayValue: string } | null;
}

interface DatabaseVariantProjection {
  readonly sku: string;
  readonly offerName: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly vatRate: Prisma.Decimal;
  readonly minOrderQuantity: Prisma.Decimal;
  readonly salesMultiple: Prisma.Decimal;
  readonly countryOfOrigin: string | null;
  readonly manufacturer: string | null;
  readonly shelfLifeDays: number | null;
  readonly storageConditions: string | null;
  readonly allowBackorder: boolean;
  readonly active: boolean;
  readonly sortOrder: number;
}

interface DatabasePriceProjection {
  readonly amount: Prisma.Decimal;
  readonly oldAmount: Prisma.Decimal | null;
  readonly currency: string;
  readonly vatIncluded: boolean;
}

interface DatabaseStockProjection {
  readonly onHand: Prisma.Decimal;
  readonly reserved: Prisma.Decimal;
  readonly available: Prisma.Decimal;
}

function decimalProjection(
  value: Prisma.Decimal | number | string | null | undefined,
): string | null {
  return value === null || value === undefined ? null : new Prisma.Decimal(value).toString();
}

function attributeProjectionFromSource(attribute: OneCAttribute): Record<string, unknown> {
  const common = {
    code: attribute.code,
    name: attribute.name,
    dataType: attribute.dataType,
    unit: attribute.unit ?? null,
  };
  switch (attribute.dataType) {
    case 'ENUM':
      return {
        ...common,
        value: normalizeEnumAttributeValue(attribute.value),
        displayValue: attribute.displayValue,
      };
    case 'TEXT':
      return { ...common, value: attribute.value };
    case 'NUMBER':
      return { ...common, value: decimalProjection(attribute.value) };
    case 'BOOLEAN':
      return { ...common, value: attribute.value };
  }
}

function attributeProjectionFromDatabase(
  assignment: DatabaseAttributeAssignment,
): Record<string, unknown> {
  const common = {
    code: assignment.definition.code,
    name: assignment.definition.name,
    dataType: assignment.definition.dataType,
    unit: assignment.definition.unit,
  };
  switch (assignment.definition.dataType) {
    case 'ENUM':
      return {
        ...common,
        value: assignment.value?.normalizedValue ?? null,
        displayValue: assignment.value?.displayValue ?? null,
      };
    case 'TEXT':
      return { ...common, value: assignment.textValue };
    case 'NUMBER':
      return { ...common, value: decimalProjection(assignment.numericValue) };
    case 'BOOLEAN':
      return { ...common, value: assignment.booleanValue };
  }
}

function variantProjectionFromSource(
  variant: OneCVariant,
  sortOrder: number,
): Record<string, unknown> {
  return {
    sku: variant.sku,
    offerName: variant.offerName,
    packDescription: variant.packDescription ?? null,
    unit: variant.unit,
    vatRate: decimalProjection(variant.vatRate),
    minOrderQuantity: decimalProjection(variant.minOrderQuantity),
    salesMultiple: decimalProjection(variant.salesMultiple),
    countryOfOrigin: variant.countryOfOrigin ?? null,
    manufacturer: variant.manufacturer ?? null,
    shelfLifeDays: variant.shelfLifeDays ?? null,
    storageConditions: variant.storageConditions ?? null,
    allowBackorder: variant.allowBackorder,
    active: variant.active,
    sortOrder,
  };
}

function variantProjectionFromDatabase(
  variant: DatabaseVariantProjection,
): Record<string, unknown> {
  return {
    sku: variant.sku,
    offerName: variant.offerName,
    packDescription: variant.packDescription,
    unit: variant.unit,
    vatRate: decimalProjection(variant.vatRate),
    minOrderQuantity: decimalProjection(variant.minOrderQuantity),
    salesMultiple: decimalProjection(variant.salesMultiple),
    countryOfOrigin: variant.countryOfOrigin,
    manufacturer: variant.manufacturer,
    shelfLifeDays: variant.shelfLifeDays,
    storageConditions: variant.storageConditions,
    allowBackorder: variant.allowBackorder,
    active: variant.active,
    sortOrder: variant.sortOrder,
  };
}

function normalizedOldAmount(price: OneCPrice): number | null {
  return price.oldAmount !== null && price.oldAmount > price.amount ? price.oldAmount : null;
}

function priceProjectionFromSource(price: OneCPrice): Record<string, unknown> {
  return {
    amount: decimalProjection(price.amount),
    oldAmount: decimalProjection(normalizedOldAmount(price)),
    currency: price.currency,
    vatIncluded: price.vatIncluded,
  };
}

function priceProjectionFromDatabase(price: DatabasePriceProjection): Record<string, unknown> {
  return {
    amount: decimalProjection(price.amount),
    oldAmount: decimalProjection(price.oldAmount),
    currency: price.currency,
    vatIncluded: price.vatIncluded,
  };
}

function stockProjectionFromSource(stock: OneCStock): Record<string, unknown> {
  return {
    onHand: decimalProjection(stock.onHand),
    reserved: decimalProjection(stock.reserved),
    available: decimalProjection(stock.available),
  };
}

function stockProjectionFromDatabase(stock: DatabaseStockProjection): Record<string, unknown> {
  return {
    onHand: decimalProjection(stock.onHand),
    reserved: decimalProjection(stock.reserved),
    available: decimalProjection(stock.available),
  };
}

function isRetryableTransactionConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2034'
  );
}
