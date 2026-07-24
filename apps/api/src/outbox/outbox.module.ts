import { Global, Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  imports: [QueueModule],
  providers: [OutboxService, OutboxRelayService],
  exports: [OutboxService, OutboxRelayService],
})
export class OutboxModule {}
