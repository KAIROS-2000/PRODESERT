import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type OutboxEvent } from '@prisma/client';
import { OrderAccessTokenService } from '../checkout/order-access-token.service';
import { type Environment } from '../common/config/environment';
import { IntegrationDispatchError } from '../outbox/retry-policy';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTransportService } from './email-transport.service';
import { preferenceForTemplate, templateForEvent } from './email-template.registry';
import { OrderEmailRenderer } from './order-email-renderer';

@Injectable()
export class OrderNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Environment, true>,
    private readonly accessTokens: OrderAccessTokenService,
    private readonly renderer: OrderEmailRenderer,
    private readonly transport: EmailTransportService,
  ) {}

  supports(eventType: string): boolean {
    return templateForEvent(eventType) !== undefined;
  }

  async handle(event: OutboxEvent): Promise<void> {
    const template = templateForEvent(event.eventType);
    if (!template) return;
    const orderId =
      event.aggregateType === 'order'
        ? event.aggregateId
        : this.payloadString(event.payload, 'orderId');
    if (!orderId) throw new IntegrationDispatchError('NOTIFICATION_ORDER_CLAIM_INVALID', false);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new IntegrationDispatchError('NOTIFICATION_ORDER_NOT_FOUND', false);
    const idempotencyKey = `email:${event.id}:${template}`;
    if (order.customerId) {
      const preference = preferenceForTemplate(template);
      if (preference) {
        const settings = await this.prisma.notificationPreference.findUnique({
          where: { userId: order.customerId },
          select: {
            orderUpdates: true,
            paymentUpdates: true,
            reservationReminders: true,
          },
        });
        if (settings?.[preference] === false) {
          await this.suppress(
            idempotencyKey,
            template,
            order.id,
            order.customerId,
            order.guestEmail,
          );
          return;
        }
      }
    }
    if (event.eventType === 'order.reservation_expiry_reminder') {
      const expectedDeadline = this.payloadString(event.payload, 'reservationExpiresAt');
      if (
        order.status !== 'AWAITING_PAYMENT' ||
        !order.reservationExpiresAt ||
        order.reservationExpiresAt <= new Date() ||
        expectedDeadline !== order.reservationExpiresAt.toISOString()
      ) {
        await this.suppress(idempotencyKey, template, order.id, order.customerId, order.guestEmail);
        return;
      }
    }

    const orderUrl = new URL(
      `/order/${encodeURIComponent(order.publicNumber)}`,
      this.config.get('PUBLIC_APP_URL', { infer: true }),
    );
    if (!order.customerId) orderUrl.hash = `access=${this.accessTokens.derive(order.id)}`;
    const rendered = this.renderer.render(template, {
      publicNumber: order.publicNumber,
      status: order.status,
      orderUrl: orderUrl.toString(),
      pickupAddress: order.pickupLocationAddress,
      ...(order.pickupLocationPhone ? { pickupPhone: order.pickupLocationPhone } : {}),
      ...(order.reservationExpiresAt ? { reservationExpiresAt: order.reservationExpiresAt } : {}),
    });
    const recipientHash = this.hash(order.guestEmail);
    const log = await this.prisma.emailLog.upsert({
      where: { idempotencyKey },
      create: {
        orderId: order.id,
        ...(order.customerId ? { userId: order.customerId } : {}),
        templateCode: template,
        recipientMasked: this.mask(order.guestEmail),
        recipientHash,
        subject: rendered.subject,
        idempotencyKey,
        correlationId: event.correlationId,
        status: 'PENDING',
      },
      update: {},
    });
    if (log.status === 'SENT' || log.status === 'SUPPRESSED') return;
    const maximumAttempts = this.config.get('EMAIL_MAX_ATTEMPTS', { infer: true });
    if (log.attempts >= maximumAttempts) {
      throw new IntegrationDispatchError('EMAIL_MAX_ATTEMPTS_REACHED', false);
    }
    await this.prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'SENDING',
        attempts: { increment: 1 },
        sendingStartedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    try {
      const result = await this.transport.send({
        to: order.guestEmail,
        subject: rendered.subject,
        text: rendered.text,
      });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: result.messageId,
          nextRetryAt: null,
        },
      });
    } catch {
      const attempts = log.attempts + 1;
      const retryable = attempts < maximumAttempts;
      const nextRetryAt = retryable
        ? new Date(Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** attempts))
        : null;
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: retryable ? 'RETRY_SCHEDULED' : 'FAILED',
          ...(nextRetryAt ? { nextRetryAt } : {}),
          ...(!retryable ? { failedAt: new Date() } : {}),
          lastErrorCode: 'SMTP_SEND_FAILED',
          lastErrorMessage: 'EMAIL_TRANSPORT_UNAVAILABLE',
        },
      });
      throw new IntegrationDispatchError('EMAIL_TRANSPORT_UNAVAILABLE', retryable);
    }
  }

  private async suppress(
    idempotencyKey: string,
    templateCode: string,
    orderId: string,
    userId: string | null,
    email: string,
  ): Promise<void> {
    await this.prisma.emailLog.upsert({
      where: { idempotencyKey },
      update: { status: 'SUPPRESSED' },
      create: {
        orderId,
        ...(userId ? { userId } : {}),
        templateCode,
        recipientMasked: this.mask(email),
        recipientHash: this.hash(email),
        subject: 'Уведомление не требуется',
        idempotencyKey,
        status: 'SUPPRESSED',
      },
    });
  }

  private hash(email: string): string {
    const secret =
      this.config.get('PII_HASH_SECRET', { infer: true }) ?? 'local-development-email-hash-secret';
    return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
  }

  private mask(email: string): string {
    const [local = '', domain = ''] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }

  private payloadString(payload: unknown, key: string): string | undefined {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const value = (payload as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  }
}
