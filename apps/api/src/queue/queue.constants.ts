export const OUTBOX_QUEUE_NAME = 'pro-dessert-outbox';
export const RESERVATION_QUEUE_NAME = 'pro-dessert-reservations';

export interface OutboxQueueJob {
  readonly outboxEventId: string;
}

export interface ReservationExpiryQueueJob {
  readonly orderId: string;
  readonly reservationExpiresAt: string;
  readonly correlationId: string;
}
