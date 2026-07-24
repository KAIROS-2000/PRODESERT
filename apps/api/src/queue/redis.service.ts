import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { type Environment } from '../common/config/environment';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly commandClient: Redis;
  private readonly workerClients = new Set<Redis>();

  constructor(private readonly config: ConfigService<Environment, true>) {
    this.commandClient = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      commandTimeout: 3_000,
    });
    this.commandClient.on('error', () => {
      // Callers fail closed and the JSON logger records the request-level error.
    });
  }

  async reserveNonce(key: string, ttlSeconds: number): Promise<boolean> {
    await this.ensureCommandConnection();
    const result = await this.commandClient.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureCommandConnection();
      return (await this.commandClient.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  createBullConnection(): Redis {
    const client = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    client.on('error', () => {
      // BullMQ surfaces connection failures through its own worker/queue events.
    });
    this.workerClients.add(client);
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [this.commandClient, ...this.workerClients];
    await Promise.allSettled(
      clients.map(async (client) => {
        if (client.status === 'end') return;
        try {
          await client.quit();
        } catch {
          client.disconnect(false);
        }
      }),
    );
  }

  private async ensureCommandConnection(): Promise<void> {
    if (this.commandClient.status === 'wait') {
      await this.commandClient.connect();
    }
    if (this.commandClient.status !== 'ready') {
      throw new Error('REDIS_UNAVAILABLE');
    }
  }
}
