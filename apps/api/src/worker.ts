import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { JsonLogger } from './common/logging/json-logger.service';
import { WorkerModule } from './worker/worker.module';

async function bootstrap(): Promise<void> {
  const logger = new JsonLogger();
  const application = await NestFactory.createApplicationContext(WorkerModule, {
    logger,
  });
  application.enableShutdownHooks();
  logger.log('worker_started');
}

void bootstrap().catch((error: unknown) => {
  new JsonLogger().fatal(
    'worker_bootstrap_failed',
    error instanceof Error ? { name: error.name } : { name: 'UNKNOWN' },
  );
  process.exitCode = 1;
});
