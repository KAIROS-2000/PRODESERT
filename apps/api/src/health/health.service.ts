import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../queue/redis.service';

export interface ReadinessView {
  status: 'ok' | 'degraded';
  checks: {
    database: 'up';
    redis: 'up' | 'degraded';
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  async ready(): Promise<ReadinessView> {
    await this.prisma.$queryRaw`SELECT 1`;
    const redis = (await this.redis.ping()) ? 'up' : 'degraded';
    return {
      status: redis === 'up' ? 'ok' : 'degraded',
      checks: { database: 'up', redis },
      timestamp: new Date().toISOString(),
    };
  }
}
