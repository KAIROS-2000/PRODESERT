import { Injectable } from '@nestjs/common';
import { type OrderStatus, type PaymentMethod, type PaymentStatus, Prisma } from '@prisma/client';

export type PaymentPolicyErrorCode =
  | 'BANK_TRANSFER_REQUIRED'
  | 'ORDER_NOT_AWAITING_PAYMENT'
  | 'STOCK_NOT_CONFIRMED'
  | 'RESERVATION_EXPIRED'
  | 'RESERVATION_INCOMPLETE'
  | 'PAYMENT_DETAILS_NOT_PUBLISHED'
  | 'BANK_DETAILS_INCOMPLETE'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_STATUS_INVALID'
  | 'ORGANIZATION_REQUIRED';

export class PaymentPolicyError extends Error {
  constructor(
    readonly code: PaymentPolicyErrorCode,
    message: string,
    readonly details?: Readonly<Record<string, string | number | null>>,
  ) {
    super(message);
    this.name = 'PaymentPolicyError';
  }
}

export interface PaymentGateOrder {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  currency: string;
  grandTotal: Prisma.Decimal;
  stockConfirmedAt: Date | null;
  reservationExpiresAt: Date | null;
  items: readonly {
    id: string;
    quantity: Prisma.Decimal;
  }[];
  stockReservations: readonly {
    orderItemId: string;
    quantity: Prisma.Decimal;
    status: string;
    expiresAt: Date;
    externalReservationId: string | null;
  }[];
}

export interface PublishedPaymentSnapshot {
  status: PaymentStatus;
  amount: Prisma.Decimal;
  currency: string;
  recipientName: string;
  recipientInn: string;
  settlementAccount: string;
  correspondentAccount: string;
  bik: string;
  bankName: string;
  paymentPurpose: string;
  detailsVersion: string;
  detailsPublishedAt: Date | null;
}

@Injectable()
export class PaymentPolicyService {
  assertCanPublish(order: PaymentGateOrder, now: Date): void {
    this.assertLiveCompleteReservation(order, now);
  }

  assertCanReveal(
    order: PaymentGateOrder,
    payment: PublishedPaymentSnapshot | null,
    now: Date,
  ): asserts payment is PublishedPaymentSnapshot {
    this.assertLiveCompleteReservation(order, now);
    if (!payment?.detailsPublishedAt) {
      this.fail('PAYMENT_DETAILS_NOT_PUBLISHED', 'Реквизиты ещё не опубликованы менеджером.');
    }
    if (!payment.amount.equals(order.grandTotal) || payment.currency !== order.currency) {
      this.fail(
        'PAYMENT_AMOUNT_MISMATCH',
        'Сумма платёжных реквизитов не совпадает с подтверждённой суммой заказа.',
      );
    }
    if (
      !payment.recipientName.trim() ||
      !payment.recipientInn.trim() ||
      !payment.settlementAccount.trim() ||
      !payment.correspondentAccount.trim() ||
      !payment.bik.trim() ||
      !payment.bankName.trim() ||
      !payment.paymentPurpose.trim() ||
      !payment.detailsVersion.trim()
    ) {
      this.fail('BANK_DETAILS_INCOMPLETE', 'Платёжные реквизиты заполнены не полностью.');
    }
  }

  assertCanConfirm(payment: PublishedPaymentSnapshot, order: PaymentGateOrder): void {
    if (!['PROOF_UPLOADED', 'VERIFYING', 'PENDING', 'REJECTED'].includes(payment.status)) {
      this.fail('PAYMENT_STATUS_INVALID', 'Оплату нельзя подтвердить в текущем состоянии.', {
        status: payment.status,
      });
    }
    if (!payment.amount.equals(order.grandTotal) || payment.currency !== order.currency) {
      this.fail('PAYMENT_AMOUNT_MISMATCH', 'Сумма платежа не совпадает с суммой заказа.');
    }
  }

  assertCanReject(payment: PublishedPaymentSnapshot): void {
    if (!['PROOF_UPLOADED', 'VERIFYING'].includes(payment.status)) {
      this.fail('PAYMENT_STATUS_INVALID', 'Нет платежа, ожидающего проверки.', {
        status: payment.status,
      });
    }
  }

  private assertLiveCompleteReservation(order: PaymentGateOrder, now: Date): void {
    if (order.paymentMethod !== 'BANK_TRANSFER' || order.currency !== 'RUB') {
      this.fail(
        'BANK_TRANSFER_REQUIRED',
        'Для заказа разрешён только банковский перевод в рублях.',
      );
    }
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_VERIFICATION') {
      this.fail('ORDER_NOT_AWAITING_PAYMENT', 'Заказ не находится на этапе банковского перевода.', {
        status: order.status,
      });
    }
    if (!order.stockConfirmedAt) {
      this.fail('STOCK_NOT_CONFIRMED', 'Наличие не подтверждено в 1С.');
    }
    if (!order.reservationExpiresAt || order.reservationExpiresAt.getTime() <= now.getTime()) {
      this.fail('RESERVATION_EXPIRED', 'Срок резерва истёк.');
    }
    if (order.items.length === 0) {
      this.fail('RESERVATION_INCOMPLETE', 'В заказе отсутствуют строки товара.');
    }

    const reservedByItem = new Map<string, Prisma.Decimal>();
    for (const reservation of order.stockReservations) {
      if (
        reservation.status !== 'ACTIVE' ||
        !reservation.externalReservationId ||
        reservation.expiresAt.getTime() <= now.getTime()
      ) {
        continue;
      }
      const current = reservedByItem.get(reservation.orderItemId) ?? new Prisma.Decimal(0);
      reservedByItem.set(reservation.orderItemId, current.plus(reservation.quantity));
    }
    for (const item of order.items) {
      const reserved = reservedByItem.get(item.id);
      if (!reserved?.equals(item.quantity)) {
        this.fail('RESERVATION_INCOMPLETE', 'Активный резерв не покрывает все строки заказа.', {
          orderItemId: item.id,
          expected: item.quantity.toString(),
          actual: reserved?.toString() ?? '0',
        });
      }
    }
  }

  private fail(
    code: PaymentPolicyErrorCode,
    message: string,
    details?: Readonly<Record<string, string | number | null>>,
  ): never {
    throw new PaymentPolicyError(code, message, details);
  }
}
