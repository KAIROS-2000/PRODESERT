import { type OutboxEvent } from '@prisma/client';

export const OUTBOX_EVENT_HANDLER = Symbol('OUTBOX_EVENT_HANDLER');

export interface OutboxEventHandler {
  handle(event: OutboxEvent): Promise<void>;
}
