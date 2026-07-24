import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { type AuthenticatedPrincipal, type AuthenticatedRequest } from '../auth/auth.types';
import { ConfirmPaymentDto, PublishPaymentDetailsDto, RejectPaymentDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';
import { type PaymentActionResult } from './payment.types';

@Controller('admin/orders')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Post(':id/send-payment-details')
  @HttpCode(HttpStatus.ACCEPTED)
  publishDetails(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: PublishPaymentDetailsDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentActionResult> {
    return this.payments.publishDetails({
      orderId,
      expectedVersion: dto.expectedOrderVersion,
      actor: principal,
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }

  @Post(':id/confirm-payment')
  confirmPayment(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: ConfirmPaymentDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentActionResult> {
    return this.payments.confirmPayment({
      orderId,
      expectedVersion: dto.expectedOrderVersion,
      expectedPaymentVersion: dto.expectedPaymentVersion,
      actor: principal,
      ...(dto.comment?.trim() ? { reason: dto.comment.trim() } : {}),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }

  @Post(':id/reject-payment')
  rejectPayment(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: RejectPaymentDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaymentActionResult> {
    return this.payments.rejectPayment({
      orderId,
      expectedVersion: dto.expectedOrderVersion,
      expectedPaymentVersion: dto.expectedPaymentVersion,
      actor: principal,
      comment: dto.comment.trim(),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }
}
