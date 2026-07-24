import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { type Environment } from '../common/config/environment';
import { OneCInboxProcessor } from '../one-c/inbox/one-c-inbox.processor';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { OutboxRelayService } from '../outbox/outbox-relay.service';
import {
  OUTBOX_QUEUE_NAME,
  type OutboxQueueJob,
  RESERVATION_QUEUE_NAME,
  type ReservationExpiryQueueJob,
} from '../queue/queue.constants';
import { RedisService } from '../queue/redis.service';
import { ReservationExpiryProcessor } from '../reservations/reservation-expiry.processor';
import { ReservationSweeperService } from '../reservations/reservation-sweeper.service';

@Injectable()
export class WorkerRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerRuntimeService.name);
  private readonly workers: Worker[] = [];
  private readonly timers: NodeJS.Timeout[] = [];
  private relayRunning = false;
  private inboxRunning = false;
  private sweepRunning = false;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly redis: RedisService,
    private readonly relay: OutboxRelayService,
    private readonly outbox: OutboxProcessorService,
    private readonly oneCInbox: OneCInboxProcessor,
    private readonly reservationExpiry: ReservationExpiryProcessor,
    private readonly reservationSweeper: ReservationSweeperService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.redis.ping())) {
      throw new Error('WORKER_REDIS_UNAVAILABLE');
    }
    const concurrency = this.config.get('WORKER_CONCURRENCY', { infer: true });
    const outboxWorker = new Worker<OutboxQueueJob>(
      OUTBOX_QUEUE_NAME,
      (job) => this.outbox.process(job.data.outboxEventId),
      { connection: this.redis.createBullConnection(), concurrency },
    );
    const reservationWorker = new Worker<ReservationExpiryQueueJob>(
      RESERVATION_QUEUE_NAME,
      (job) => this.reservationExpiry.process(job),
      { connection: this.redis.createBullConnection(), concurrency },
    );
    for (const worker of [outboxWorker, reservationWorker]) {
      worker.on('error', (error) => {
        this.logger.error({ event: 'worker_error', code: error.name }, undefined);
      });
      worker.on('failed', (job, error) => {
        this.logger.error(
          { event: 'job_failed', jobId: job?.id ?? null, code: error.name },
          undefined,
        );
      });
      this.workers.push(worker);
    }
    await Promise.all(this.workers.map((worker) => worker.waitUntilReady()));

    const relayTimer = setInterval(
      () => void this.runRelay(),
      this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }),
    );
    const inboxTimer = setInterval(
      () => void this.runInbox(),
      this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }),
    );
    const sweepTimer = setInterval(
      () => void this.runSweep(),
      this.config.get('RESERVATION_SWEEP_INTERVAL_MS', { infer: true }),
    );
    this.timers.push(relayTimer, inboxTimer, sweepTimer);
    await Promise.all([this.runRelay(), this.runInbox(), this.runSweep()]);
  }

  async onModuleDestroy(): Promise<void> {
    this.timers.forEach((timer) => clearInterval(timer));
    await Promise.allSettled(this.workers.map((worker) => worker.close()));
  }

  private async runRelay(): Promise<void> {
    if (this.relayRunning) return;
    this.relayRunning = true;
    try {
      await this.relay.relayBatch();
    } catch (error: unknown) {
      this.logger.error(
        { event: 'outbox_relay_failed', code: error instanceof Error ? error.name : 'UNKNOWN' },
        undefined,
      );
    } finally {
      this.relayRunning = false;
    }
  }

  private async runInbox(): Promise<void> {
    if (this.inboxRunning) return;
    this.inboxRunning = true;
    try {
      await this.oneCInbox.processQueued();
    } catch (error: unknown) {
      this.logger.error(
        { event: 'one_c_inbox_poll_failed', code: error instanceof Error ? error.name : 'UNKNOWN' },
        undefined,
      );
    } finally {
      this.inboxRunning = false;
    }
  }

  private async runSweep(): Promise<void> {
    if (this.sweepRunning) return;
    this.sweepRunning = true;
    try {
      await this.reservationSweeper.sweep();
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'reservation_sweep_failed',
          code: error instanceof Error ? error.name : 'UNKNOWN',
        },
        undefined,
      );
    } finally {
      this.sweepRunning = false;
    }
  }
}
