import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { type Response } from 'express';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { PaymentDocumentService } from '../files/payment-document.service';
import { RequestCorrelationId } from '../common/request/request-correlation-id.decorator';
import {
  AddInternalNoteDto,
  AdminAuditQueryDto,
  AdminDashboardQueryDto,
  AdminOrdersQueryDto,
  AdminPaymentsQueryDto,
  AdminReservationsQueryDto,
  AdminSyncJobsQueryDto,
  CancelOrderDto,
  ExpectedOrderVersionDto,
  RetryDto,
} from './dto/admin.dto';
import { AdminOperationsService } from './admin-operations.service';

const PRIVATE_CACHE = 'private, no-store, max-age=0';

@Controller('admin')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminOperationsController {
  constructor(
    private readonly operations: AdminOperationsService,
    private readonly documents: PaymentDocumentService,
  ) {}

  @Get('dashboard')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  dashboard(@Query() query: AdminDashboardQueryDto): Promise<Record<string, unknown>> {
    return this.operations.dashboard(query.from, query.to);
  }

  @Get('orders')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  orders(@Query() query: AdminOrdersQueryDto): Promise<Record<string, unknown>> {
    return this.operations.orders(query);
  }

  @Get('orders/export')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="pro-dessert-orders.csv"')
  @Roles(Role.MANAGER, Role.ADMIN)
  async ordersExport(@Query() query: AdminOrdersQueryDto): Promise<string> {
    return `\uFEFF${await this.operations.ordersCsv(query)}`;
  }

  @Get('orders/:id')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  order(@Param('id', new ParseUUIDPipe()) id: string): Promise<Record<string, unknown>> {
    return this.operations.order(id);
  }

  @Post('orders/:id/start-assembly')
  @Roles(Role.MANAGER, Role.ADMIN)
  startAssembly(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ExpectedOrderVersionDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.transition(id, 'ASSEMBLING', dto, principal, correlationId);
  }

  @Post('orders/:id/mark-ready')
  @Roles(Role.MANAGER, Role.ADMIN)
  markReady(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ExpectedOrderVersionDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.transition(id, 'READY_FOR_PICKUP', dto, principal, correlationId);
  }

  @Post('orders/:id/complete')
  @Roles(Role.MANAGER, Role.ADMIN)
  complete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ExpectedOrderVersionDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.transition(id, 'COMPLETED', dto, principal, correlationId);
  }

  @Post('orders/:id/cancel')
  @Roles(Role.MANAGER, Role.ADMIN)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.cancel(id, dto, principal, correlationId);
  }

  @Post('orders/:id/notes')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.MANAGER, Role.ADMIN)
  addNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddInternalNoteDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.addNote(id, dto, principal, correlationId);
  }

  @Get('payments')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  payments(@Query() query: AdminPaymentsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.payments(query);
  }

  @Get('payments/:id')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  payment(@Param('id', new ParseUUIDPipe()) id: string): Promise<Record<string, unknown>> {
    return this.operations.payment(id);
  }

  @Get('payment-documents/:id/download')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  async downloadPaymentDocument(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Buffer> {
    const document = await this.documents.getPrivate(id);
    await this.operations.recordPaymentDocumentDownload(id, principal, correlationId);
    response.setHeader('Content-Type', document.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    );
    response.setHeader('Content-Length', document.bytes.length.toString());
    return document.bytes;
  }

  @Get('reservations')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.MANAGER, Role.ADMIN)
  reservations(@Query() query: AdminReservationsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.reservations(query);
  }

  @Get('integration/overview')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  integrationOverview(): Promise<Record<string, unknown>> {
    return this.operations.integrationOverview();
  }

  @Get('integration/jobs')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  syncJobs(@Query() query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.syncJobs(query);
  }

  @Get('integration/errors')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  syncErrors(@Query() query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.syncErrors(query);
  }

  @Get('integration/discrepancies')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  discrepancies(@Query() query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.syncErrors(query, true);
  }

  @Get('integration/dlq')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  dlq(@Query() query: AdminSyncJobsQueryDto): Promise<Record<string, unknown>> {
    return this.operations.dlq(query);
  }

  @Post('integration/jobs/:id/retry')
  @Roles(Role.ADMIN)
  retrySyncJob(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RetryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.retrySyncJob(id, dto, principal, correlationId);
  }

  @Post('integration/outbox/:id/retry')
  @Roles(Role.ADMIN)
  retryOutbox(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RetryDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @RequestCorrelationId() correlationId?: string,
  ): Promise<Record<string, unknown>> {
    return this.operations.retryOutboxEvent(id, dto, principal, correlationId);
  }

  @Get('audit')
  @Header('Cache-Control', PRIVATE_CACHE)
  @Roles(Role.ADMIN)
  audit(@Query() query: AdminAuditQueryDto): Promise<Record<string, unknown>> {
    return this.operations.audit(query);
  }
}
