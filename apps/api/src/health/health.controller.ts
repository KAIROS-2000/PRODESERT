import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthService, type ReadinessView } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return this.health.live();
  }

  @Get('ready')
  async ready(): Promise<ReadinessView> {
    try {
      return await this.health.ready();
    } catch {
      throw new ServiceUnavailableException({
        code: 'NOT_READY',
        message: 'A required dependency is unavailable.',
      });
    }
  }
}
