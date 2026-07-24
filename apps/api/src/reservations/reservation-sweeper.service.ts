import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationService } from './reservation.service';

export interface ReservationSweepResult {
  examined: number;
  expired: number;
  failed: number;
}

@Injectable()
export class ReservationSweeperService {
  private readonly logger = new Logger(ReservationSweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationService,
  ) {}

  async sweep(now = new Date(), limit = 100): Promise<ReservationSweepResult> {
    const due = await this.prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lte: now },
        order: { status: { in: ['AWAITING_PAYMENT', 'PAYMENT_VERIFICATION'] } },
      },
      distinct: ['orderId'],
      orderBy: [{ orderId: 'asc' }, { expiresAt: 'asc' }],
      take: Math.max(1, Math.min(limit, 500)),
      select: { orderId: true },
    });

    let expired = 0;
    let failed = 0;
    for (const candidate of due) {
      try {
        const result = await this.reservations.expire(
          candidate.orderId,
          now,
          `reservation-sweeper:${candidate.orderId}:${now.toISOString()}`,
        );
        if (!result.duplicate) expired += 1;
      } catch (error: unknown) {
        failed += 1;
        this.logger.error(
          {
            event: 'reservation_sweep_failed',
            orderId: candidate.orderId,
            code: error instanceof Error ? error.name : 'UNKNOWN',
          },
          undefined,
        );
      }
    }
    return { examined: due.length, expired, failed };
  }
}
