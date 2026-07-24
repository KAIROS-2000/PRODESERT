import { Injectable } from '@nestjs/common';
import { type Job } from 'bullmq';
import { ReservationService, type ReleaseReservationResult } from './reservation.service';

export const RESERVATION_EXPIRY_JOB = 'reservation.expire';

export interface ReservationExpiryJobData {
  orderId: string;
  reservationExpiresAt: string;
  correlationId: string;
}

@Injectable()
export class ReservationExpiryProcessor {
  constructor(private readonly reservations: ReservationService) {}

  async process(
    job: Pick<Job<ReservationExpiryJobData>, 'data'>,
    now = new Date(),
  ): Promise<ReleaseReservationResult> {
    const expectedExpiry = new Date(job.data.reservationExpiresAt);
    if (Number.isNaN(expectedExpiry.getTime())) {
      throw new Error('Reservation expiry job contains an invalid reservationExpiresAt');
    }
    return this.reservations.expire(job.data.orderId, now, job.data.correlationId);
  }
}
