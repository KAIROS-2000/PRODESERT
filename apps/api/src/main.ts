import 'reflect-metadata';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { type Environment } from './common/config/environment';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { JsonLogger } from './common/logging/json-logger.service';

async function bootstrap(): Promise<void> {
  const bootstrapLogger = new JsonLogger();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: bootstrapLogger,
    bodyParser: false,
  });
  const config = app.get(ConfigService<Environment, true>);
  const logger = app.get(JsonLogger);
  const allowedOrigins = new Set(
    config.get('CORS_ORIGINS', { infer: true }).map((origin) => new URL(origin).origin),
  );
  if (config.get('TRUST_PROXY', { infer: true })) {
    app.set('trust proxy', 1);
  }

  app.setGlobalPrefix('api/v1');
  app.use(json({ limit: '128kb' }));
  app.use(urlencoded({ extended: false, limit: '64kb' }));
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: true },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'X-Correlation-Id',
      'X-CSRF-Token',
      'Idempotency-Key',
      'Authorization',
    ],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => callback(null, !origin || allowedOrigins.has(origin)),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log('api_started', { port, prefix: '/api/v1' });
}

void bootstrap().catch((error: unknown) => {
  new JsonLogger().fatal('api_bootstrap_failed', error);
  process.exitCode = 1;
});
