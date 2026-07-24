import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { type Environment } from '../common/config/environment';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { ONE_C_ADAPTER, type OneCAdapter } from './adapters/one-c-adapter';
import { MockOneCAdapter } from './adapters/mock-one-c.adapter';
import { RestOneCAdapter } from './adapters/rest-one-c.adapter';
import { ONE_C_ORDER_EXPORT_SOURCE } from './export/one-c-order-export.source';
import { PrismaOneCOrderExportSource } from './export/prisma-one-c-order-export.source';
import { ONE_C_INBOX_REPOSITORY } from './inbox/one-c-inbox.repository';
import { OneCInboxProcessor } from './inbox/one-c-inbox.processor';
import { OneCInboxService } from './inbox/one-c-inbox.service';
import { PrismaOneCInboxRepository } from './inbox/prisma-one-c-inbox.repository';
import { ONE_C_STATUS_APPLIER, ReservationOneCStatusApplier } from './inbox/one-c-status-applier';
import { ONE_C_OUTBOX_HANDLER, OneCCommandService } from './one-c-command.service';
import { OneCController } from './one-c.controller';
import { ConfiguredOneCHmacKeyStore } from './security/configured-one-c-key.store';
import { ONE_C_NONCE_STORE } from './security/one-c-nonce-store';
import { RedisOneCNonceStore } from './security/redis-one-c-nonce.store';
import { OneCSignatureGuard } from './security/one-c-signature.guard';
import {
  ONE_C_KEY_STORE,
  ONE_C_SIGNATURE_OPTIONS,
  type OneCSignatureOptions,
  OneCSignatureService,
} from './security/one-c-signature.service';

@Module({
  imports: [ConfigModule, PrismaModule, QueueModule, ReservationsModule],
  controllers: [OneCController],
  providers: [
    OneCSignatureService,
    ConfiguredOneCHmacKeyStore,
    { provide: ONE_C_KEY_STORE, useExisting: ConfiguredOneCHmacKeyStore },
    RedisOneCNonceStore,
    { provide: ONE_C_NONCE_STORE, useExisting: RedisOneCNonceStore },
    {
      provide: ONE_C_SIGNATURE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): OneCSignatureOptions => {
        const tolerance = config.get('ONE_C_SIGNATURE_TOLERANCE_SECONDS', {
          infer: true,
        });
        return {
          maxClockSkewSeconds: tolerance,
          nonceTtlSeconds: tolerance * 2 + 1,
        };
      },
    },
    {
      provide: ONE_C_ADAPTER,
      inject: [ConfigService, OneCSignatureService],
      useFactory: (
        config: ConfigService<Environment, true>,
        signatures: OneCSignatureService,
      ): OneCAdapter => {
        if (config.get('ONE_C_ADAPTER', { infer: true }) === 'mock') {
          return new MockOneCAdapter({
            reservationHours: config.get('DEFAULT_RESERVATION_HOURS', {
              infer: true,
            }),
          });
        }

        const baseUrl = config.get('ONE_C_BASE_URL', { infer: true });
        const secret = config.get('ONE_C_OUTBOUND_HMAC_SECRET', { infer: true });
        const keyId = config.get('ONE_C_KEY_ID', { infer: true });
        if (!baseUrl || !secret || Buffer.byteLength(secret, 'utf8') < 32) {
          throw new Error(
            'ONE_C_BASE_URL and a 32-byte ONE_C_OUTBOUND_HMAC_SECRET are required for the REST adapter',
          );
        }
        return new RestOneCAdapter({
          baseUrl,
          timeoutMs: config.get('ONE_C_REQUEST_TIMEOUT_MS', { infer: true }),
          authorizationHeaders: async ({ method, pathAndQuery, rawBody }) => {
            const timestamp = String(Math.floor(Date.now() / 1_000));
            const nonce = randomUUID();
            const contentSha256 = signatures.contentHash(Buffer.from(rawBody, 'utf8'));
            const signature = signatures.sign(
              { method, pathAndQuery, timestamp, nonce, contentSha256 },
              secret,
            );
            return {
              'x-pd-key-id': keyId,
              'x-pd-timestamp': timestamp,
              'x-pd-nonce': nonce,
              'x-pd-content-sha256': contentSha256,
              'x-pd-signature': signature,
            };
          },
        });
      },
    },
    PrismaOneCInboxRepository,
    {
      provide: ONE_C_INBOX_REPOSITORY,
      useExisting: PrismaOneCInboxRepository,
    },
    ReservationOneCStatusApplier,
    {
      provide: ONE_C_STATUS_APPLIER,
      useExisting: ReservationOneCStatusApplier,
    },
    OneCInboxService,
    OneCInboxProcessor,
    OneCCommandService,
    {
      provide: ONE_C_OUTBOX_HANDLER,
      useExisting: OneCCommandService,
    },
    PrismaOneCOrderExportSource,
    {
      provide: ONE_C_ORDER_EXPORT_SOURCE,
      useExisting: PrismaOneCOrderExportSource,
    },
    OneCSignatureGuard,
  ],
  exports: [
    ONE_C_ADAPTER,
    ONE_C_OUTBOX_HANDLER,
    ONE_C_STATUS_APPLIER,
    OneCInboxService,
    OneCInboxProcessor,
    OneCCommandService,
    PrismaOneCInboxRepository,
  ],
})
export class OneCModule {}
