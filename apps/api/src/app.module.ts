import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AccountModule } from './account/account.module';
import { AccountOrdersModule } from './account-orders/account-orders.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CartModule } from './cart/cart.module';
import { CheckoutModule } from './checkout/checkout.module';
import { CommonModule } from './common/common.module';
import { validateEnvironment } from './common/config/environment';
import { RequestLoggingInterceptor } from './common/logging/request-logging.interceptor';
import { RequestContextMiddleware } from './common/request/request-context.middleware';
import { CsrfGuard } from './common/security/csrf.guard';
import { HealthModule } from './health/health.module';
import { OneCModule } from './one-c/one-c.module';
import { OutboxModule } from './outbox/outbox.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RbacModule } from './rbac/rbac.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    CommonModule,
    PrismaModule,
    QueueModule,
    OutboxModule,
    AuditModule,
    AccountModule,
    AccountOrdersModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    ReservationsModule,
    OneCModule,
    PaymentsModule,
    RbacModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
