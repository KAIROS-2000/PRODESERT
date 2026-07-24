import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { type OneCInboxReceipt } from '../dto/one-c-envelope.dto';
import {
  type OneCOrderStatusEnvelopeDto,
  ONE_C_ORDER_STATUS_EVENT,
} from '../dto/one-c-order-status.dto';
import { oneCPayloadHash } from '../one-c-canonical-json';
import {
  ONE_C_INBOX_REPOSITORY,
  type OneCInboxAcceptCommand,
  type OneCInboxRepository,
} from './one-c-inbox.repository';

@Injectable()
export class OneCInboxService {
  constructor(@Inject(ONE_C_INBOX_REPOSITORY) private readonly repository: OneCInboxRepository) {}

  async acceptOrderStatus(envelope: OneCOrderStatusEnvelopeDto): Promise<OneCInboxReceipt> {
    const receivedAt = new Date();
    const receipt: OneCInboxReceipt = {
      messageId: envelope.messageId,
      correlationId: envelope.correlationId,
      status: 'ACCEPTED',
      receivedAt: receivedAt.toISOString(),
      results: [{ externalId: envelope.payload.eventId, status: 'QUEUED' }],
    };
    const command: OneCInboxAcceptCommand = {
      source: 'ONE_C',
      adapter: 'one-c:inbound:v1',
      eventType: ONE_C_ORDER_STATUS_EVENT,
      messageId: envelope.messageId,
      idempotencyKey: envelope.idempotencyKey,
      externalEventId: envelope.payload.eventId,
      correlationId: envelope.correlationId,
      schemaVersion: envelope.schemaVersion,
      sourceRevision: envelope.sourceRevision,
      streamKey: `order:${envelope.payload.publicNumber}`,
      sequence: envelope.payload.orderVersion,
      payloadHash: oneCPayloadHash(envelope.payload),
      payload: envelope.payload,
      receivedAt,
      receipt,
    };
    const result = await this.repository.accept(command);
    if (result.kind === 'ACCEPTED' || result.kind === 'DUPLICATE') {
      return result.receipt;
    }
    if (result.kind === 'CONFLICT') {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency identity is already associated with another payload.',
      });
    }
    if (result.kind === 'STALE') {
      throw new ConflictException({
        code: 'STALE_VERSION',
        message: 'The order event version is not newer than the accepted version.',
        details: {
          incomingVersion: envelope.payload.orderVersion,
          currentVersion: result.currentSequence,
        },
      });
    }
    throw new ConflictException({
      code: 'VERSION_GAP',
      message: 'The order event sequence contains a gap.',
      details: {
        incomingVersion: envelope.payload.orderVersion,
        expectedVersion: result.expectedSequence,
      },
    });
  }
}
