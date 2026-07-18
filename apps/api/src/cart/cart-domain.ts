import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { type CheckoutFieldError } from '@pro-dessert/contracts';
import { type CheckoutDto } from '../checkout/dto/checkout.dto';

export const ZERO_MONEY = new Prisma.Decimal(0);

export function money(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateLineTotals(
  unitPrice: Prisma.Decimal,
  oldUnitPrice: Prisma.Decimal | null,
  quantity: Prisma.Decimal,
): {
  unitDiscount: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
} {
  const listUnitPrice = oldUnitPrice ?? unitPrice;
  const lineSubtotal = money(listUnitPrice.times(quantity));
  const lineTotal = money(unitPrice.times(quantity));
  return {
    unitDiscount: money(listUnitPrice.minus(unitPrice)),
    lineSubtotal,
    lineDiscount: money(lineSubtotal.minus(lineTotal)),
    lineTotal,
  };
}

export function decimalString(value: Prisma.Decimal): string {
  return value.toFixed().replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
}

export function isValidSalesQuantity(
  quantity: Prisma.Decimal,
  minimum: Prisma.Decimal,
  multiple: Prisma.Decimal,
): boolean {
  return quantity.greaterThanOrEqualTo(minimum) && quantity.modulo(multiple).isZero();
}

export function greatestValidQuantity(
  requested: Prisma.Decimal,
  available: Prisma.Decimal,
  minimum: Prisma.Decimal,
  multiple: Prisma.Decimal,
): Prisma.Decimal | null {
  const bounded = Prisma.Decimal.min(requested, available);
  const adjusted = bounded.dividedToIntegerBy(multiple).times(multiple);
  return adjusted.greaterThanOrEqualTo(minimum) ? adjusted : null;
}

export function resolveStockQuantity(
  requested: Prisma.Decimal,
  available: Prisma.Decimal,
  minimum: Prisma.Decimal,
  multiple: Prisma.Decimal,
  allowBackorder: boolean,
): Prisma.Decimal | null {
  return allowBackorder
    ? requested
    : greatestValidQuantity(requested, available, minimum, multiple);
}

export function validateCheckoutFields(
  dto: CheckoutDto,
  timezone: string,
  now = new Date(),
): CheckoutFieldError[] {
  const errors: CheckoutFieldError[] = [];
  if (dto.firstName.trim().length < 2) {
    errors.push({
      field: 'firstName',
      code: 'FIRST_NAME_REQUIRED',
      message: 'Укажите имя (не менее двух символов).',
    });
  }
  const phone = dto.phone.trim();
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^\+?[0-9 ()-]{7,24}$/.test(phone) || !/^\d{10,15}$/.test(phoneDigits)) {
    errors.push({
      field: 'phone',
      code: 'PHONE_INVALID',
      message: 'Укажите корректный номер телефона.',
    });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim())) {
    errors.push({
      field: 'email',
      code: 'EMAIL_INVALID',
      message: 'Укажите корректный email.',
    });
  }
  if (!dto.privacyConsent) {
    errors.push({
      field: 'privacyConsent',
      code: 'PRIVACY_CONSENT_REQUIRED',
      message: 'Необходимо согласие на обработку персональных данных.',
    });
  }
  if (!dto.orderTermsConsent) {
    errors.push({
      field: 'orderTermsConsent',
      code: 'ORDER_TERMS_CONSENT_REQUIRED',
      message: 'Необходимо согласие с условиями заказа.',
    });
  }
  if (dto.desiredPickupAt) {
    const dateValid = isCalendarDate(dto.desiredPickupAt);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    if (!dateValid || dto.desiredPickupAt < today) {
      errors.push({
        field: 'desiredPickupAt',
        code: 'PICKUP_DATE_INVALID',
        message: 'Выберите сегодняшнюю или будущую дату самовывоза.',
      });
    }
  }
  if (
    dto.organization &&
    (dto.organization.name.trim().length === 0 ||
      !/^(?:\d{10}|\d{12})$/.test(dto.organization.inn.trim()) ||
      (dto.organization.kpp !== undefined && !/^\d{9}$/.test(dto.organization.kpp.trim())))
  ) {
    errors.push({
      field: 'organization',
      code: 'ORGANIZATION_INVALID',
      message: 'Проверьте название и реквизиты организации.',
    });
  }
  return errors;
}

export function checkoutRequestHash(dto: CheckoutDto): string {
  const canonical = {
    cartUpdatedAt: new Date(dto.cartUpdatedAt).toISOString(),
    firstName: dto.firstName.trim(),
    lastName: dto.lastName?.trim() || null,
    phone: dto.phone.trim(),
    email: dto.email.trim().normalize('NFKC').toLowerCase(),
    privacyConsent: dto.privacyConsent,
    orderTermsConsent: dto.orderTermsConsent,
    comment: dto.comment?.trim() || null,
    desiredPickupAt: dto.desiredPickupAt ?? null,
    organization: dto.organization
      ? {
          name: dto.organization.name.trim(),
          inn: dto.organization.inn.trim(),
          kpp: dto.organization.kpp?.trim() || null,
        }
      : null,
  };
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
