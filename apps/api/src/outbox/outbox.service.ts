import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type OutboxEvent, Prisma } from '@prisma/client';
import { canonicalJsonHash } from './canonical-json';

type OutboxTransaction = Prisma.TransactionClient;

export interface CreateOutboxEventInput {
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payload: Prisma.InputJsonValue;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly schemaVersion?: string;
  readonly availableAt?: Date;
}

export class OutboxIdempotencyConflictError extends Error {
  constructor(readonly idempotencyKey: string) {
    super(`Outbox idempotency key was reused: ${idempotencyKey}`);
    this.name = 'OutboxIdempotencyConflictError';
  }
}

@Injectable()
export class OutboxService {
  async create(
    transaction: OutboxTransaction,
    input: CreateOutboxEventInput,
  ): Promise<OutboxEvent> {
    const payloadHash = canonicalJsonHash(input.payload);
    const event = await transaction.outboxEvent.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        schemaVersion: input.schemaVersion ?? '1.0',
        payload: input.payload,
        payloadHash,
        idempotencyKey: input.idempotencyKey,
        correlationId: input.correlationId ?? randomUUID(),
        ...(input.causationId ? { causationId: input.causationId } : {}),
        ...(input.availableAt ? { availableAt: input.availableAt } : {}),
      },
    });
    if (
      event.aggregateType !== input.aggregateType ||
      event.aggregateId !== input.aggregateId ||
      event.eventType !== input.eventType ||
      event.payloadHash !== payloadHash
    ) {
      throw new OutboxIdempotencyConflictError(input.idempotencyKey);
    }
    return event;
  }
}
