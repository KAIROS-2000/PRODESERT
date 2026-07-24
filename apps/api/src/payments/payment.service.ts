import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Order, type Payment } from '@prisma/client';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { InvoiceService } from '../files/invoice.service';
import { PaymentDocumentService } from '../files/payment-document.service';
import { OrderTransitionService } from '../orders/order-transition.service';
import { canonicalJsonHash } from '../outbox/canonical-json';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { BankDetailsService } from './bank-details.service';
import { type SubmitPaymentProofDto } from './dto/payment.dto';
import {
  PaymentPolicyError,
  PaymentPolicyService,
  type PaymentGateOrder,
  type PublishedPaymentSnapshot,
} from './payment-policy.service';
import { PublicOrderPaymentAccessService } from './public-order-payment-access.service';
import {
  type InvoiceDownload,
  type PaymentActionResult,
  type PaymentProofResult,
  type PublicPaymentView,
  type UploadedPaymentProof,
} from './payment.types';

const paymentOrderInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      sku: true,
      productName: true,
      offerName: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      vatRate: true,
      vatIncluded: true,
      lineTotal: true,
    },
  },
  stockReservations: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      orderItemId: true,
      quantity: true,
      status: true,
      expiresAt: true,
      externalReservationId: true,
    },
  },
  payment: {
    include: {
      documents: {
        where: {
          storageStatus: 'AVAILABLE' as const,
          scanStatus: { in: ['CLEAN', 'NOT_REQUIRED'] as const },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.OrderInclude;

type PaymentOrderRecord = Prisma.OrderGetPayload<{ include: typeof paymentOrderInclude }>;

interface PublishDetailsCommand {
  orderId: string;
  expectedVersion: number;
  actor: AuthenticatedPrincipal;
  reason?: string;
  correlationId?: string;
}

interface ConfirmPaymentCommand extends PublishDetailsCommand {
  expectedPaymentVersion: number;
}

interface RejectPaymentCommand {
  orderId: string;
  expectedVersion: number;
  expectedPaymentVersion: number;
  actor: AuthenticatedPrincipal;
  comment: string;
  correlationId?: string;
}

export interface ConfirmPaymentFromOneCCommand {
  orderId: string;
  oneCVersion: number;
  externalPaymentId: string;
  confirmedAt: Date;
  confirmedTotal?: string;
  currency?: string;
  correlationId?: string;
  eventId?: string;
  comment?: string;
}

interface SubmitProofCommand {
  publicNumber: string;
  authorization?: string;
  principal?: AuthenticatedPrincipal;
  idempotencyKey: string;
  dto: SubmitPaymentProofDto;
  file?: UploadedPaymentProof;
  correlationId?: string;
}

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PaymentPolicyService,
    private readonly bankDetails: BankDetailsService,
    private readonly access: PublicOrderPaymentAccessService,
    private readonly transitions: OrderTransitionService,
    private readonly outbox: OutboxService,
    private readonly documents: PaymentDocumentService,
    private readonly invoices: InvoiceService,
  ) {}

  async publicPayment(
    rawPublicNumber: string,
    authorization: string | undefined,
    principal: AuthenticatedPrincipal | undefined,
  ): Promise<PublicPaymentView> {
    const order = await this.findPublicOrder(rawPublicNumber);
    this.access.assertAccess(order, this.access.bearerToken(authorization), principal);
    this.assertCanReveal(order, order.payment, new Date());
    return this.toPublicView(order, order.payment);
  }

  publishDetails(command: PublishDetailsCommand): Promise<PaymentActionResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockOrder(tx, command.orderId);
          const order = await this.orderById(tx, command.orderId);
          if (order.payment) {
            return this.actionResult(order, order.payment, true);
          }
          this.assertOrderVersion(order, command.expectedVersion);
          this.assertCanPublish(order, new Date());

          const now = new Date();
          const correlationId = command.correlationId ?? randomUUID();
          const details = this.bankDetails.snapshot(order.publicNumber);
          const payment = await tx.payment.create({
            data: {
              orderId: order.id,
              status: 'PENDING',
              amount: order.grandTotal,
              currency: 'RUB',
              recipientName: details.recipientName,
              recipientInn: details.recipientInn,
              ...(details.recipientKpp ? { recipientKpp: details.recipientKpp } : {}),
              settlementAccount: details.settlementAccount,
              correspondentAccount: details.correspondentAccount,
              bik: details.bik,
              bankName: details.bankName,
              paymentPurpose: details.paymentPurpose,
              detailsVersion: details.detailsVersion,
              isDemo: details.isDemo,
              detailsPublishedAt: now,
            },
          });
          const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: { version: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              action: 'PAYMENT_DETAILS_PUBLISHED',
              entityType: 'Payment',
              entityId: payment.id,
              source: 'ADMIN',
              actorUserId: command.actor.userId,
              actorRole: command.actor.role,
              ...(command.reason ? { reason: command.reason } : {}),
              correlationId,
              metadata: {
                orderId: order.id,
                publicNumber: order.publicNumber,
                orderVersion: updatedOrder.version,
                paymentVersion: payment.version,
                detailsVersion: payment.detailsVersion,
                isDemo: payment.isDemo,
                reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
              },
            },
          });
          await this.outbox.create(tx, {
            aggregateType: 'payment',
            aggregateId: payment.id,
            eventType: 'payment.details_published',
            idempotencyKey: `payment.details-published:${payment.id}:v${payment.version}`,
            correlationId,
            payload: {
              orderId: order.id,
              paymentId: payment.id,
              orderVersion: updatedOrder.version,
              paymentVersion: payment.version,
            },
          });
          return this.actionResult({ ...order, version: updatedOrder.version }, payment, false);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async submitProof(command: SubmitProofCommand): Promise<PaymentProofResult> {
    const order = await this.findPublicOrder(command.publicNumber);
    this.access.assertAccess(
      order,
      this.access.bearerToken(command.authorization),
      command.principal,
    );
    this.assertCanReveal(order, order.payment, new Date());
    const payment = order.payment;
    this.assertPaymentVersion(payment, command.dto.expectedPaymentVersion);
    const paymentReference = command.dto.paymentReference?.trim();
    const customerComment = command.dto.comment?.trim();
    if (!command.file && !paymentReference) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_EMPTY',
        message: 'Укажите номер платежа или прикрепите подтверждение перевода.',
      });
    }
    if (
      command.file &&
      (command.file.size < 1 || command.file.buffer.length !== command.file.size)
    ) {
      throw new BadRequestException({
        code: 'PAYMENT_PROOF_INVALID',
        message: 'Прикреплённый файл пуст или повреждён.',
      });
    }

    const requestHash = canonicalJsonHash({
      paymentId: payment.id,
      expectedPaymentVersion: command.dto.expectedPaymentVersion,
      paymentReference: paymentReference ?? null,
      customerComment: customerComment ?? null,
      fileSha256: command.file
        ? createHash('sha256').update(command.file.buffer).digest('hex')
        : null,
    });
    const scopeHash = createHash('sha256')
      .update(`payment-proof:${order.id}`, 'utf8')
      .digest('hex');
    const replay = await this.acquireIdempotency(scopeHash, command.idempotencyKey, requestHash);
    if (replay) return replay;

    try {
      const document = command.file
        ? await this.documents.storeProof({
            paymentId: payment.id,
            orderId: order.id,
            file: command.file,
            source: 'STOREFRONT',
            ...(command.principal ? { uploadedByUserId: command.principal.userId } : {}),
          })
        : null;
      const result = await this.withSerializableRetry(() =>
        this.prisma.$transaction(
          async (tx) => {
            await this.lockOrderAndPayment(tx, order.id);
            const currentOrder = await this.orderById(tx, order.id);
            const currentPayment = currentOrder.payment;
            this.assertCanReveal(currentOrder, currentPayment, new Date());
            this.assertPaymentVersion(currentPayment, command.dto.expectedPaymentVersion);
            if (currentPayment.status === 'CONFIRMED' || currentPayment.status === 'REFUNDED') {
              throw new ConflictException({
                code: 'PAYMENT_ALREADY_CONFIRMED',
                message: 'Оплата уже подтверждена.',
              });
            }

            const now = new Date();
            const correlationId = command.correlationId ?? randomUUID();
            const updatedPayment = await tx.payment.update({
              where: { id: currentPayment.id },
              data: {
                status: 'PROOF_UPLOADED',
                ...(paymentReference ? { paymentReference } : {}),
                ...(customerComment ? { customerComment } : {}),
                proofSubmittedAt: now,
                verificationStartedAt: null,
                confirmedAt: null,
                rejectedAt: null,
                refundedAt: null,
                verifiedByUserId: null,
                verificationSource: null,
                rejectionComment: null,
                version: { increment: 1 },
              },
            });
            const updatedOrder =
              currentOrder.status === 'AWAITING_PAYMENT'
                ? await this.transitions.transitionInTransaction(tx, {
                    orderId: currentOrder.id,
                    toStatus: 'PAYMENT_VERIFICATION',
                    source: 'STOREFRONT',
                    expectedVersion: currentOrder.version,
                    correlationId,
                    metadata: {
                      paymentId: updatedPayment.id,
                      paymentVersion: updatedPayment.version,
                      documentId: document?.id ?? null,
                    },
                    occurredAt: now,
                  })
                : await tx.order.update({
                    where: { id: currentOrder.id },
                    data: { version: { increment: 1 } },
                  });
            const response = this.proofResult(
              updatedOrder,
              updatedPayment,
              document?.id ?? null,
              now,
            );
            await tx.auditLog.create({
              data: {
                action: 'PAYMENT_PROOF_SUBMITTED',
                entityType: 'Payment',
                entityId: updatedPayment.id,
                source: 'STOREFRONT',
                ...(command.principal
                  ? {
                      actorUserId: command.principal.userId,
                      actorRole: command.principal.role,
                    }
                  : {}),
                correlationId,
                metadata: {
                  orderId: currentOrder.id,
                  publicNumber: currentOrder.publicNumber,
                  orderVersion: updatedOrder.version,
                  paymentVersion: updatedPayment.version,
                  hasReference: Boolean(paymentReference),
                  documentId: document?.id ?? null,
                },
              },
            });
            await this.outbox.create(tx, {
              aggregateType: 'payment',
              aggregateId: updatedPayment.id,
              eventType: 'payment.proof_submitted',
              idempotencyKey: `payment.proof-submitted:${updatedPayment.id}:v${updatedPayment.version}`,
              correlationId,
              payload: {
                orderId: currentOrder.id,
                paymentId: updatedPayment.id,
                orderVersion: updatedOrder.version,
                paymentVersion: updatedPayment.version,
                documentId: document?.id ?? null,
              },
            });
            await tx.idempotencyRecord.update({
              where: {
                scopeHash_operation_key: {
                  scopeHash,
                  operation: 'PAYMENT_PROOF_SUBMIT',
                  key: command.idempotencyKey,
                },
              },
              data: {
                status: 'COMPLETED',
                responseStatus: 202,
                responseBody: response as unknown as Prisma.InputJsonObject,
                resourceType: 'Payment',
                resourceId: updatedPayment.id,
                lockedUntil: null,
                completedAt: now,
              },
            });
            return response;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
      return result;
    } catch (error: unknown) {
      await this.failIdempotency(scopeHash, command.idempotencyKey, requestHash, error);
      throw error;
    }
  }

  confirmPayment(command: ConfirmPaymentCommand): Promise<PaymentActionResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockOrderAndPayment(tx, command.orderId);
          const order = await this.orderById(tx, command.orderId);
          const payment = order.payment;
          if (payment?.status === 'CONFIRMED' && order.status === 'PAID') {
            return this.actionResult(order, payment, true);
          }
          this.assertOrderVersion(order, command.expectedVersion);
          this.assertPaymentVersion(payment, command.expectedPaymentVersion);
          this.assertCanReveal(order, payment, new Date());
          try {
            this.policy.assertCanConfirm(payment, order);
          } catch (error: unknown) {
            throw this.policyConflict(error);
          }

          const now = new Date();
          const correlationId = command.correlationId ?? randomUUID();
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'CONFIRMED',
              confirmedAt: now,
              rejectedAt: null,
              refundedAt: null,
              verifiedByUserId: command.actor.userId,
              verificationSource: 'ADMIN',
              rejectionComment: null,
              version: { increment: 1 },
            },
          });
          const updatedOrder = await this.transitions.transitionInTransaction(tx, {
            orderId: order.id,
            toStatus: 'PAID',
            source: 'ADMIN',
            expectedVersion: order.version,
            actorUserId: command.actor.userId,
            actorRole: command.actor.role,
            ...(command.reason ? { reason: command.reason } : {}),
            correlationId,
            metadata: {
              paymentId: payment.id,
              paymentVersion: updatedPayment.version,
            },
            occurredAt: now,
          });
          await tx.auditLog.create({
            data: {
              action: 'PAYMENT_CONFIRMED',
              entityType: 'Payment',
              entityId: payment.id,
              source: 'ADMIN',
              actorUserId: command.actor.userId,
              actorRole: command.actor.role,
              ...(command.reason ? { reason: command.reason } : {}),
              correlationId,
              metadata: {
                orderId: order.id,
                publicNumber: order.publicNumber,
                amount: payment.amount.toFixed(2),
                currency: payment.currency,
                orderVersion: updatedOrder.version,
                paymentVersion: updatedPayment.version,
              },
            },
          });
          await this.outbox.create(tx, {
            aggregateType: 'payment',
            aggregateId: payment.id,
            eventType: 'payment.confirmed',
            idempotencyKey: `payment.confirmed:${payment.id}:v${updatedPayment.version}`,
            correlationId,
            payload: {
              orderId: order.id,
              paymentId: payment.id,
              orderVersion: updatedOrder.version,
              paymentVersion: updatedPayment.version,
            },
          });
          return this.actionResult(updatedOrder, updatedPayment, false);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  confirmFromOneC(command: ConfirmPaymentFromOneCCommand): Promise<PaymentActionResult> {
    if (
      !Number.isInteger(command.oneCVersion) ||
      command.oneCVersion < 1 ||
      !command.externalPaymentId.trim() ||
      !Number.isFinite(command.confirmedAt.getTime())
    ) {
      throw new UnprocessableEntityException({
        code: 'ONE_C_PAYMENT_CONFIRMATION_INVALID',
        message: 'Подтверждение оплаты 1С содержит некорректные поля.',
      });
    }
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockOrderAndPayment(tx, command.orderId);
          const order = await this.orderById(tx, command.orderId);
          const payment = order.payment;
          if (!payment) {
            throw new ConflictException({
              code: 'PAYMENT_DETAILS_NOT_PUBLISHED',
              message: 'Нельзя подтвердить оплату до публикации платёжных реквизитов.',
            });
          }
          if (
            (command.confirmedTotal &&
              !new Prisma.Decimal(command.confirmedTotal).equals(order.grandTotal)) ||
            (command.currency && command.currency !== order.currency)
          ) {
            throw new UnprocessableEntityException({
              code: 'ONE_C_PAYMENT_AMOUNT_MISMATCH',
              message: 'Сумма или валюта подтверждения 1С не совпадает с заказом.',
            });
          }
          if (order.oneCVersion !== null && command.oneCVersion < order.oneCVersion) {
            throw new ConflictException({
              code: 'ONE_C_VERSION_STALE',
              message: 'Получена устаревшая версия оплаты 1С.',
              details: {
                currentVersion: order.oneCVersion,
                receivedVersion: command.oneCVersion,
              },
            });
          }
          if (payment.status === 'CONFIRMED' && order.status === 'PAID') {
            if (order.oneCVersion !== null && command.oneCVersion === order.oneCVersion) {
              return this.actionResult(order, payment, true);
            }
            const acknowledged = await tx.order.update({
              where: { id: order.id },
              data: {
                oneCVersion: command.oneCVersion,
                version: { increment: 1 },
              },
            });
            await tx.auditLog.create({
              data: {
                action: 'ONE_C_PAYMENT_CONFIRMATION_ACKNOWLEDGED',
                entityType: 'Payment',
                entityId: payment.id,
                source: 'ONE_C',
                ...(command.comment ? { reason: command.comment } : {}),
                ...(command.correlationId ? { correlationId: command.correlationId } : {}),
                metadata: {
                  orderId: order.id,
                  oneCVersion: command.oneCVersion,
                  externalPaymentId: command.externalPaymentId,
                  confirmedAt: command.confirmedAt.toISOString(),
                  verificationSource: payment.verificationSource,
                },
              },
            });
            return this.actionResult(acknowledged, payment, true);
          }
          if (order.oneCVersion !== null && command.oneCVersion === order.oneCVersion) {
            throw new ConflictException({
              code: 'ONE_C_VERSION_CONFLICT',
              message: 'Эта версия 1С уже применена с другим состоянием заказа.',
            });
          }
          this.assertCanReveal(order, payment, new Date());
          try {
            this.policy.assertCanConfirm(payment, order);
          } catch (error: unknown) {
            throw this.policyConflict(error);
          }
          if (command.confirmedAt < payment.detailsPublishedAt) {
            throw new UnprocessableEntityException({
              code: 'ONE_C_PAYMENT_CONFIRMATION_INVALID',
              message: 'Время оплаты 1С предшествует публикации реквизитов.',
            });
          }

          const correlationId = command.correlationId ?? randomUUID();
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'CONFIRMED',
              paymentReference: command.externalPaymentId.trim(),
              confirmedAt: command.confirmedAt,
              rejectedAt: null,
              refundedAt: null,
              verifiedByUserId: null,
              verificationSource: 'ONE_C',
              rejectionComment: null,
              version: { increment: 1 },
            },
          });
          const transitioned = await this.transitions.transitionInTransaction(tx, {
            orderId: order.id,
            toStatus: 'PAID',
            source: 'ONE_C',
            expectedVersion: order.version,
            ...(command.comment ? { reason: command.comment } : {}),
            correlationId,
            metadata: {
              eventId: command.eventId ?? null,
              externalPaymentId: command.externalPaymentId,
              oneCVersion: command.oneCVersion,
              paymentId: payment.id,
              paymentVersion: updatedPayment.version,
            },
            occurredAt: command.confirmedAt,
          });
          const updatedOrder = await tx.order.update({
            where: { id: order.id },
            data: { oneCVersion: command.oneCVersion },
          });
          await tx.auditLog.create({
            data: {
              action: 'PAYMENT_CONFIRMED',
              entityType: 'Payment',
              entityId: payment.id,
              source: 'ONE_C',
              ...(command.comment ? { reason: command.comment } : {}),
              correlationId,
              metadata: {
                eventId: command.eventId ?? null,
                orderId: order.id,
                publicNumber: order.publicNumber,
                oneCVersion: command.oneCVersion,
                externalPaymentId: command.externalPaymentId,
                amount: payment.amount.toFixed(2),
                currency: payment.currency,
                orderVersion: transitioned.version,
                paymentVersion: updatedPayment.version,
              },
            },
          });
          await this.outbox.create(tx, {
            aggregateType: 'payment',
            aggregateId: payment.id,
            eventType: 'payment.confirmed',
            idempotencyKey: `payment.confirmed-one-c:${payment.id}:${command.oneCVersion}`,
            correlationId,
            ...(command.eventId ? { causationId: command.eventId } : {}),
            payload: {
              orderId: order.id,
              paymentId: payment.id,
              orderVersion: transitioned.version,
              paymentVersion: updatedPayment.version,
              oneCVersion: command.oneCVersion,
            },
          });
          return this.actionResult(
            { ...updatedOrder, version: transitioned.version },
            updatedPayment,
            false,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  rejectPayment(command: RejectPaymentCommand): Promise<PaymentActionResult> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.lockOrderAndPayment(tx, command.orderId);
          const order = await this.orderById(tx, command.orderId);
          const payment = order.payment;
          if (
            payment?.status === 'REJECTED' &&
            payment.rejectionComment === command.comment &&
            order.status === 'AWAITING_PAYMENT'
          ) {
            return this.actionResult(order, payment, true);
          }
          this.assertOrderVersion(order, command.expectedVersion);
          this.assertPaymentVersion(payment, command.expectedPaymentVersion);
          if (order.status !== 'PAYMENT_VERIFICATION') {
            throw new ConflictException({
              code: 'PAYMENT_REJECTION_NOT_ALLOWED',
              message: 'Заказ не ожидает проверки платежа.',
            });
          }
          try {
            this.policy.assertCanReject(payment);
          } catch (error: unknown) {
            throw this.policyConflict(error);
          }

          const now = new Date();
          const correlationId = command.correlationId ?? randomUUID();
          const updatedPayment = await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: 'REJECTED',
              confirmedAt: null,
              refundedAt: null,
              rejectedAt: now,
              verifiedByUserId: command.actor.userId,
              verificationSource: 'ADMIN',
              rejectionComment: command.comment,
              version: { increment: 1 },
            },
          });
          const updatedOrder = await this.transitions.transitionInTransaction(tx, {
            orderId: order.id,
            toStatus: 'AWAITING_PAYMENT',
            source: 'ADMIN',
            expectedVersion: order.version,
            actorUserId: command.actor.userId,
            actorRole: command.actor.role,
            reason: command.comment,
            correlationId,
            metadata: {
              paymentId: payment.id,
              paymentVersion: updatedPayment.version,
            },
            occurredAt: now,
          });
          await tx.auditLog.create({
            data: {
              action: 'PAYMENT_REJECTED',
              entityType: 'Payment',
              entityId: payment.id,
              source: 'ADMIN',
              actorUserId: command.actor.userId,
              actorRole: command.actor.role,
              reason: command.comment,
              correlationId,
              metadata: {
                orderId: order.id,
                publicNumber: order.publicNumber,
                orderVersion: updatedOrder.version,
                paymentVersion: updatedPayment.version,
              },
            },
          });
          await this.outbox.create(tx, {
            aggregateType: 'payment',
            aggregateId: payment.id,
            eventType: 'payment.rejected',
            idempotencyKey: `payment.rejected:${payment.id}:v${updatedPayment.version}`,
            correlationId,
            payload: {
              orderId: order.id,
              paymentId: payment.id,
              orderVersion: updatedOrder.version,
              paymentVersion: updatedPayment.version,
            },
          });
          return this.actionResult(updatedOrder, updatedPayment, false);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async invoice(
    rawPublicNumber: string,
    authorization: string | undefined,
    principal: AuthenticatedPrincipal | undefined,
  ): Promise<InvoiceDownload> {
    const order = await this.findPublicOrder(rawPublicNumber);
    this.access.assertAccess(order, this.access.bearerToken(authorization), principal);
    this.assertCanReveal(order, order.payment, new Date());
    if (!this.organization(order.organizationData)) {
      throw new UnprocessableEntityException({
        code: 'INVOICE_REQUIRES_ORGANIZATION',
        message: 'PDF-счёт доступен только для заказа юридического лица.',
      });
    }
    const invoice = await this.invoices.getOrCreateForPayment(order.payment.id);
    return {
      filename: invoice.filename.replaceAll('"', ''),
      mimeType: 'application/pdf',
      bytes: invoice.bytes,
    };
  }

  private async findPublicOrder(rawPublicNumber: string): Promise<PaymentOrderRecord | null> {
    const publicNumber = this.access.normalizePublicNumber(rawPublicNumber);
    return this.prisma.order.findUnique({
      where: { publicNumber },
      include: paymentOrderInclude,
    });
  }

  private orderById(tx: Prisma.TransactionClient, orderId: string): Promise<PaymentOrderRecord> {
    return tx.order
      .findUnique({ where: { id: orderId }, include: paymentOrderInclude })
      .then((order) => {
        if (!order) throw this.orderNotFound();
        return order;
      });
  }

  private assertCanPublish(order: PaymentGateOrder, now: Date): void {
    try {
      this.policy.assertCanPublish(order, now);
    } catch (error: unknown) {
      throw this.policyConflict(error);
    }
  }

  private assertCanReveal(
    order: PaymentGateOrder,
    payment: PublishedPaymentSnapshot | null,
    now: Date,
  ): asserts payment is PublishedPaymentSnapshot {
    try {
      this.policy.assertCanReveal(order, payment, now);
    } catch (error: unknown) {
      throw this.policyConflict(error);
    }
  }

  private policyConflict(error: unknown): unknown {
    if (!(error instanceof PaymentPolicyError)) return error;
    return new ConflictException({
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  private assertOrderVersion(order: Order, expected: number): void {
    if (order.version !== expected) {
      throw new ConflictException({
        code: 'ORDER_VERSION_CONFLICT',
        message: 'Заказ уже изменён. Обновите данные и повторите действие.',
        details: { expectedVersion: expected, actualVersion: order.version },
      });
    }
  }

  private assertPaymentVersion(
    payment: Payment | null,
    expected: number,
  ): asserts payment is Payment {
    if (!payment) {
      throw new ConflictException({
        code: 'PAYMENT_DETAILS_NOT_PUBLISHED',
        message: 'Платёжные реквизиты ещё не опубликованы.',
      });
    }
    if (payment.version !== expected) {
      throw new ConflictException({
        code: 'PAYMENT_VERSION_CONFLICT',
        message: 'Данные платежа уже изменены. Обновите заказ и повторите действие.',
        details: { expectedVersion: expected, actualVersion: payment.version },
      });
    }
  }

  private async lockOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  }

  private async lockOrderAndPayment(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    await this.lockOrder(tx, orderId);
    await tx.$queryRaw`
      SELECT id
      FROM payments
      WHERE order_id = ${orderId}::uuid
      FOR UPDATE
    `;
  }

  private actionResult(
    order: Pick<Order, 'id' | 'status' | 'version' | 'reservationExpiresAt'>,
    payment: Pick<Payment, 'id' | 'status' | 'version'>,
    duplicate: boolean,
  ): PaymentActionResult {
    return {
      orderId: order.id,
      orderStatus: order.status,
      orderVersion: order.version,
      paymentId: payment.id,
      paymentStatus: payment.status,
      idempotentReplay: duplicate,
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      paymentVersion: payment.version,
    };
  }

  private proofResult(
    order: Pick<Order, 'id' | 'status' | 'version' | 'reservationExpiresAt'>,
    payment: Pick<Payment, 'id' | 'status' | 'version'>,
    documentId: string | null,
    submittedAt: Date,
  ): PaymentProofResult {
    return {
      ...this.actionResult(order, payment, false),
      proofSubmittedAt: submittedAt.toISOString(),
      documentId,
    };
  }

  private toPublicView(
    order: PaymentOrderRecord,
    payment: NonNullable<PaymentOrderRecord['payment']>,
  ): PublicPaymentView {
    return {
      paymentId: payment.id,
      paymentVersion: payment.version,
      status: payment.status,
      amount: payment.amount.toFixed(2),
      currency: 'RUB',
      detailsPublishedAt: payment.detailsPublishedAt.toISOString(),
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? '',
      bankDetails: {
        recipient: payment.recipientName,
        inn: payment.recipientInn,
        kpp: payment.recipientKpp,
        settlementAccount: payment.settlementAccount,
        correspondentAccount: payment.correspondentAccount,
        bik: payment.bik,
        bankName: payment.bankName,
        paymentPurpose: payment.paymentPurpose,
        detailsVersion: payment.detailsVersion,
        isDemo: payment.isDemo,
      },
      paymentReference: payment.paymentReference,
      customerComment: payment.customerComment,
      proofSubmittedAt: payment.proofSubmittedAt?.toISOString() ?? null,
      confirmedAt: payment.confirmedAt?.toISOString() ?? null,
      rejectedAt: payment.rejectedAt?.toISOString() ?? null,
      rejectionComment: payment.rejectionComment,
      documents: payment.documents.map((document) => ({
        id: document.id,
        kind: document.kind,
        filename: document.originalFilename,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes.toString(),
        storageStatus: document.storageStatus,
        scanStatus: document.scanStatus,
        availableAt: document.availableAt?.toISOString() ?? null,
        createdAt: document.createdAt.toISOString(),
      })),
      invoiceAvailable: this.organization(order.organizationData),
      warning:
        'Приложенное подтверждение перевода не означает оплату. Дождитесь проверки менеджером и статуса «Оплачен».',
    };
  }

  private async acquireIdempotency(
    scopeHash: string,
    key: string,
    requestHash: string,
  ): Promise<PaymentProofResult | null> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.idempotencyRecord.findUnique({
            where: {
              scopeHash_operation_key: {
                scopeHash,
                operation: 'PAYMENT_PROOF_SUBMIT',
                key,
              },
            },
          });
          if (existing && existing.requestHash !== requestHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_KEY_REUSED',
              message: 'Этот Idempotency-Key уже использован для другого запроса.',
            });
          }
          if (existing?.status === 'COMPLETED') {
            return this.parseProofResult(existing.responseBody);
          }
          if (existing?.status === 'FAILED') {
            throw new ConflictException({
              code: 'IDEMPOTENCY_REQUEST_FAILED',
              message:
                'Предыдущая попытка завершилась ошибкой. Повторите запрос с новым Idempotency-Key.',
            });
          }
          const now = new Date();
          if (
            existing?.status === 'IN_PROGRESS' &&
            existing.lockedUntil &&
            existing.lockedUntil.getTime() > now.getTime()
          ) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
              message: 'Этот запрос уже выполняется. Повторите проверку через несколько секунд.',
            });
          }
          const lockedUntil = new Date(now.getTime() + 5 * 60_000);
          if (existing) {
            await tx.idempotencyRecord.update({
              where: { id: existing.id },
              data: { lockedUntil },
            });
          } else {
            await tx.idempotencyRecord.create({
              data: {
                scopeHash,
                operation: 'PAYMENT_PROOF_SUBMIT',
                key,
                requestHash,
                status: 'IN_PROGRESS',
                lockedUntil,
                expiresAt: new Date(now.getTime() + 30 * 86_400_000),
              },
            });
          }
          return null;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async failIdempotency(
    scopeHash: string,
    key: string,
    requestHash: string,
    error: unknown,
  ): Promise<void> {
    const responseStatus = error instanceof HttpException ? error.getStatus() : 500;
    await this.prisma.idempotencyRecord.updateMany({
      where: {
        scopeHash,
        operation: 'PAYMENT_PROOF_SUBMIT',
        key,
        requestHash,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'FAILED',
        responseStatus,
        responseBody: { code: 'PAYMENT_PROOF_SUBMISSION_FAILED' },
        lockedUntil: null,
        completedAt: new Date(),
      },
    });
  }

  private parseProofResult(value: Prisma.JsonValue | null): PaymentProofResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESPONSE_INVALID',
        message: 'Сохранённый результат запроса недоступен.',
      });
    }
    const result = value as Record<string, unknown>;
    const requiredStrings = [
      'orderId',
      'orderStatus',
      'paymentId',
      'paymentStatus',
      'proofSubmittedAt',
    ] as const;
    if (
      !requiredStrings.every((key) => typeof result[key] === 'string') ||
      typeof result.orderVersion !== 'number' ||
      typeof result.paymentVersion !== 'number' ||
      typeof result.idempotentReplay !== 'boolean' ||
      (result.documentId !== null && typeof result.documentId !== 'string') ||
      (result.reservationExpiresAt !== null && typeof result.reservationExpiresAt !== 'string')
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_RESPONSE_INVALID',
        message: 'Сохранённый результат запроса повреждён.',
      });
    }
    return result as unknown as PaymentProofResult;
  }

  private organization(value: Prisma.JsonValue | null): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.name === 'string' &&
      record.name.trim().length > 0 &&
      typeof record.inn === 'string' &&
      /^(?:\d{10}|\d{12})$/.test(record.inn)
    );
  }

  private orderNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORDER_NOT_FOUND',
      message: 'Заказ не найден.',
    });
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error: unknown) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2002', 'P2034'].includes(error.code) ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error('unreachable');
  }
}
