import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports Redis degradation without taking the storefront API out of readiness', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { ping: jest.fn().mockResolvedValue(false) };
    const service = new HealthService(prisma as never, redis as never);

    await expect(service.ready()).resolves.toMatchObject({
      status: 'degraded',
      checks: { database: 'up', redis: 'degraded' },
    });
  });

  it('reports all required and auxiliary dependencies when healthy', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { ping: jest.fn().mockResolvedValue(true) };
    const service = new HealthService(prisma as never, redis as never);

    await expect(service.ready()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });
});
