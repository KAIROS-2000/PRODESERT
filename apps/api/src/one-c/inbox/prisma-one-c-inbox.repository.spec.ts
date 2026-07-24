import { SyncJobStatus } from '@prisma/client';
import { PrismaOneCInboxRepository } from './prisma-one-c-inbox.repository';
import { type OneCInboxAcceptCommand } from './one-c-inbox.repository';

function command(): OneCInboxAcceptCommand {
  const receivedAt = new Date('2026-07-18T06:30:00.000Z');
  return {
    source: 'ONE_C',
    adapter: 'one-c:inbound:v1',
    eventType: 'order.status.updated',
    messageId: '550e8400-e29b-41d4-a716-446655440000',
    idempotencyKey: 'one-c:order:event:7',
    externalEventId: 'event-7',
    correlationId: '9716f8ee-a989-4f1e-9e9c-c3267c55f768',
    schemaVersion: '1.0',
    sourceRevision: '4817',
    streamKey: 'order:PD-7',
    sequence: 7,
    payloadHash: 'a'.repeat(64),
    payload: { orderVersion: 7, privateContact: 'stored-only-in-protected-payload' },
    receivedAt,
    receipt: {
      messageId: '550e8400-e29b-41d4-a716-446655440000',
      correlationId: '9716f8ee-a989-4f1e-9e9c-c3267c55f768',
      status: 'ACCEPTED',
      receivedAt: receivedAt.toISOString(),
      results: [{ externalId: 'event-7', status: 'QUEUED' }],
    },
  };
}

describe('PrismaOneCInboxRepository', () => {
  it('persists a queued job and advances its cursor in one transaction', async () => {
    const syncJobCreate = jest.fn().mockResolvedValue({ id: 'job-1' });
    const cursorCreate = jest.fn().mockResolvedValue({ id: 'cursor-1' });
    const transaction = {
      syncJob: {
        findMany: jest.fn().mockResolvedValue([]),
        create: syncJobCreate,
      },
      integrationCursor: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: cursorCreate,
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (value: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const repository = new PrismaOneCInboxRepository(prisma as never);

    await expect(repository.accept(command())).resolves.toMatchObject({ kind: 'ACCEPTED' });
    expect(syncJobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: SyncJobStatus.QUEUED,
        sourceSequence: 7,
        sourceRevision: '4817',
        entityKey: 'order:PD-7',
      }),
    });
    expect(cursorCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currentVersion: '7',
        lastPayloadHash: 'a'.repeat(64),
      }),
    });
  });

  it('requeues a previously rejected gap once the missing version has arrived', async () => {
    const source = command();
    const timestamp = source.receivedAt;
    const jobUpdate = jest.fn().mockResolvedValue({ id: 'job-gap' });
    const cursorUpdate = jest.fn().mockResolvedValue({ id: 'cursor-1' });
    const errorUpdate = jest.fn().mockResolvedValue({ id: 'error-gap' });
    const existing = {
      id: 'job-gap',
      direction: 'INBOUND',
      eventType: source.eventType,
      adapter: source.adapter,
      messageId: source.messageId,
      externalEventId: source.externalEventId,
      internalEntityId: null,
      externalEntityId: null,
      entityKey: source.streamKey,
      idempotencyKey: source.idempotencyKey,
      correlationId: source.correlationId,
      schemaVersion: source.schemaVersion,
      sourceRevision: source.sourceRevision,
      sourceSequence: source.sequence,
      payloadHash: source.payloadHash,
      payload: source.payload,
      status: 'REJECTED',
      attempts: 0,
      availableAt: timestamp,
      receivedAt: timestamp,
      processingStartedAt: null,
      processedAt: timestamp,
      nextRetryAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      errors: [
        {
          id: 'error-gap',
          code: 'VERSION_GAP',
          details: { incomingSequence: 7, expectedSequence: 6 },
        },
      ],
    };
    const transaction = {
      syncJob: {
        findMany: jest.fn().mockResolvedValue([existing]),
        update: jobUpdate,
      },
      integrationCursor: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cursor-1',
          currentVersion: '6',
        }),
        update: cursorUpdate,
      },
      syncError: { update: errorUpdate },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (value: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const repository = new PrismaOneCInboxRepository(prisma as never);

    await expect(repository.accept(source)).resolves.toMatchObject({ kind: 'ACCEPTED' });
    expect(jobUpdate).toHaveBeenCalledWith({
      where: { id: 'job-gap' },
      data: expect.objectContaining({ status: SyncJobStatus.QUEUED, processedAt: null }),
    });
    expect(cursorUpdate).toHaveBeenCalledWith({
      where: { id: 'cursor-1' },
      data: expect.objectContaining({ currentVersion: '7' }),
    });
    expect(errorUpdate).toHaveBeenCalledWith({
      where: { id: 'error-gap' },
      data: expect.objectContaining({ resolvedBy: 'SYSTEM' }),
    });
  });
});
