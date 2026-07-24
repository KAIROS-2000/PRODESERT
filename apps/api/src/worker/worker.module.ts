import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from '../common/common.module';
import { validateEnvironment } from '../common/config/environment';
import { OneCModule } from '../one-c/one-c.module';
import { OUTBOX_EVENT_HANDLER } from '../outbox/outbox-handler';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxProcessorService } from '../outbox/outbox-processor.service';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ApplicationOutboxHandler } from './application-outbox-handler.service';
import { WorkerRuntimeService } from './worker-runtime.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    CommonModule,
    PrismaModule,
    QueueModule,
    OutboxModule,
    ReservationsModule,
    OneCModule,
  ],
  providers: [
    ApplicationOutboxHandler,
    { provide: OUTBOX_EVENT_HANDLER, useExisting: ApplicationOutboxHandler },
    OutboxProcessorService,
    WorkerRuntimeService,
  ],
})
export class WorkerModule {}
