import { ONE_C_SCHEMA_VERSION } from '../dto/one-c-envelope.dto';

export interface DecimalSnapshot {
  toFixed(fractionDigits?: number): string;
}

export type DecimalSnapshotValue = string | DecimalSnapshot;

export interface OneCOrderExportItemRecord {
  readonly id: string;
  readonly oneCProductId: string;
  readonly oneCVariantId: string;
  readonly sku: string;
  readonly productName: string;
  readonly brandName: string | null;
  readonly offerName: string;
  readonly unit: string;
  readonly quantity: DecimalSnapshotValue;
  readonly unitPrice: DecimalSnapshotValue;
  readonly oldUnitPrice: DecimalSnapshotValue | null;
  readonly lineDiscount: DecimalSnapshotValue;
  readonly vatRate: DecimalSnapshotValue;
  readonly lineTotal: DecimalSnapshotValue;
}

export interface OneCOrderExportRecord {
  readonly id: string;
  readonly publicNumber: string;
  readonly customerId: string | null;
  readonly guestName: string;
  readonly guestSurname: string | null;
  readonly guestPhone: string;
  readonly guestEmail: string;
  readonly organizationData: unknown | null;
  readonly fulfillmentMethod: 'PICKUP';
  readonly pickupLocationCode: string;
  readonly paymentMethod: 'BANK_TRANSFER';
  readonly customerComment: string | null;
  readonly desiredPickupAt: Date | null;
  readonly currency: 'RUB';
  readonly subtotal: DecimalSnapshotValue;
  readonly discountTotal: DecimalSnapshotValue;
  readonly grandTotal: DecimalSnapshotValue;
  readonly privacyConsentAt: Date;
  readonly orderTermsConsentAt: Date;
  readonly source: 'STOREFRONT';
  readonly version: number;
  readonly createdAt: Date;
  readonly items: readonly OneCOrderExportItemRecord[];
}

export interface OneCOrderExportMappingContext {
  readonly messageId: string;
  readonly correlationId: string;
  readonly personalDataDocumentVersion: string;
  readonly orderTermsDocumentVersion: string;
}

export interface OneCExportOrderCommand {
  readonly schemaVersion: typeof ONE_C_SCHEMA_VERSION;
  readonly messageId: string;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly eventType: 'order.created';
  readonly occurredAt: string;
  readonly payload: {
    readonly orderId: string;
    readonly publicNumber: string;
    readonly source: 'STOREFRONT';
    readonly customer: {
      readonly customerId: string | null;
      readonly name: string;
      readonly phone: string;
      readonly email: string;
    };
    readonly organization: {
      readonly name: string;
      readonly inn: string;
      readonly kpp?: string;
      readonly contactName: string;
    } | null;
    readonly fulfillmentMethod: 'PICKUP';
    readonly pickupLocationExternalId: string;
    readonly paymentMethod: 'BANK_TRANSFER';
    readonly customerComment: string | null;
    readonly requestedPickupDate: string | null;
    readonly currency: 'RUB';
    readonly subtotal: string;
    readonly discountTotal: string;
    readonly grandTotal: string;
    readonly lines: readonly {
      readonly lineId: string;
      readonly externalProductId: string;
      readonly externalVariantId: string;
      readonly sku: string;
      readonly nameSnapshot: string;
      readonly brandSnapshot: string | null;
      readonly unit: string;
      readonly quantity: string;
      readonly unitPrice: string;
      readonly oldUnitPrice: string | null;
      readonly discount: string;
      readonly vatRate: string;
      readonly lineTotal: string;
    }[];
    readonly consents: readonly {
      readonly type: 'PERSONAL_DATA_PROCESSING' | 'ORDER_TERMS';
      readonly documentVersion: string;
      readonly acceptedAt: string;
    }[];
  };
}

const MONEY_PATTERN = /^(?:0|[1-9]\d*)\.\d{2}$/;
const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)\.\d{3}$/;

function decimal(value: DecimalSnapshotValue, scale: 2 | 3): string {
  const rendered = typeof value === 'string' ? value : value.toFixed(scale);
  const normalized = normalizeDecimal(rendered, scale);
  const pattern = scale === 2 ? MONEY_PATTERN : QUANTITY_PATTERN;
  if (!pattern.test(normalized)) {
    throw new TypeError(`Invalid decimal snapshot at scale ${scale}`);
  }
  return normalized;
}

function normalizeDecimal(value: string, scale: 2 | 3): string {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    throw new TypeError('Decimal snapshots must be non-negative base-10 strings');
  }
  const [integer = '0', fraction = ''] = value.split('.');
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) {
    throw new TypeError('Decimal snapshot has unsupported precision');
  }
  return `${integer}.${fraction.slice(0, scale).padEnd(scale, '0')}`;
}

function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} must not be blank`);
  }
  return normalized;
}

function customerName(order: OneCOrderExportRecord): string {
  return [order.guestName.trim(), order.guestSurname?.trim()]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

function organization(
  value: unknown | null,
  contactName: string,
): OneCExportOrderCommand['payload']['organization'] {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('organizationData must be an object');
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (
    typeof record.name !== 'string' ||
    typeof record.inn !== 'string' ||
    !/^(?:\d{10}|\d{12})$/.test(record.inn)
  ) {
    throw new TypeError('organizationData contains invalid agreed fields');
  }
  const kpp = record.kpp;
  if (kpp !== undefined && (typeof kpp !== 'string' || !/^\d{9}$/.test(kpp))) {
    throw new TypeError('organizationData contains an invalid kpp');
  }
  return {
    name: nonBlank(record.name, 'organization.name'),
    inn: record.inn,
    ...(typeof kpp === 'string' ? { kpp } : {}),
    contactName,
  };
}

/**
 * Explicit allow-list mapper. Do not replace with object spreading: the export
 * contract must never acquire unrelated fulfillment, sensitive payment,
 * access-token, internal-comment, or audit fields by accident.
 *
 * This function intentionally performs no logging because the command contains
 * customer contact data.
 */
export function mapOrderToOneCExport(
  order: OneCOrderExportRecord,
  context: OneCOrderExportMappingContext,
): OneCExportOrderCommand {
  if (
    order.fulfillmentMethod !== 'PICKUP' ||
    order.paymentMethod !== 'BANK_TRANSFER' ||
    order.currency !== 'RUB' ||
    order.source !== 'STOREFRONT'
  ) {
    throw new TypeError('Order violates the v1 1C export invariants');
  }
  if (!Number.isInteger(order.version) || order.version < 1 || order.items.length === 0) {
    throw new TypeError('Order export requires a positive version and at least one line');
  }
  const name = nonBlank(customerName(order), 'customer.name');

  return {
    schemaVersion: ONE_C_SCHEMA_VERSION,
    messageId: nonBlank(context.messageId, 'messageId'),
    correlationId: nonBlank(context.correlationId, 'correlationId'),
    idempotencyKey: `order:${nonBlank(order.id, 'order.id')}:create:v${order.version}`,
    eventType: 'order.created',
    occurredAt: order.createdAt.toISOString(),
    payload: {
      orderId: order.id,
      publicNumber: nonBlank(order.publicNumber, 'publicNumber'),
      source: 'STOREFRONT',
      customer: {
        customerId: order.customerId,
        name,
        phone: nonBlank(order.guestPhone, 'customer.phone'),
        email: nonBlank(order.guestEmail, 'customer.email'),
      },
      organization: organization(order.organizationData, name),
      fulfillmentMethod: 'PICKUP',
      pickupLocationExternalId: nonBlank(order.pickupLocationCode, 'pickupLocationExternalId'),
      paymentMethod: 'BANK_TRANSFER',
      customerComment: order.customerComment?.trim() || null,
      requestedPickupDate: order.desiredPickupAt?.toISOString().slice(0, 10) ?? null,
      currency: 'RUB',
      subtotal: decimal(order.subtotal, 2),
      discountTotal: decimal(order.discountTotal, 2),
      grandTotal: decimal(order.grandTotal, 2),
      lines: order.items.map((item) => ({
        lineId: nonBlank(item.id, 'line.id'),
        externalProductId: nonBlank(item.oneCProductId, 'line.externalProductId'),
        externalVariantId: nonBlank(item.oneCVariantId, 'line.externalVariantId'),
        sku: nonBlank(item.sku, 'line.sku'),
        nameSnapshot: nonBlank(
          item.offerName.trim() || item.productName.trim(),
          'line.nameSnapshot',
        ),
        brandSnapshot: item.brandName?.trim() || null,
        unit: nonBlank(item.unit, 'line.unit'),
        quantity: decimal(item.quantity, 3),
        unitPrice: decimal(item.unitPrice, 2),
        oldUnitPrice: item.oldUnitPrice === null ? null : decimal(item.oldUnitPrice, 2),
        discount: decimal(item.lineDiscount, 2),
        vatRate: decimal(item.vatRate, 2),
        lineTotal: decimal(item.lineTotal, 2),
      })),
      consents: [
        {
          type: 'PERSONAL_DATA_PROCESSING',
          documentVersion: nonBlank(
            context.personalDataDocumentVersion,
            'personalDataDocumentVersion',
          ),
          acceptedAt: order.privacyConsentAt.toISOString(),
        },
        {
          type: 'ORDER_TERMS',
          documentVersion: nonBlank(context.orderTermsDocumentVersion, 'orderTermsDocumentVersion'),
          acceptedAt: order.orderTermsConsentAt.toISOString(),
        },
      ],
    },
  };
}
