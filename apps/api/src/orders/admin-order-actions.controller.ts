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
import {
  ReservationExtensionService,
  type ReservationExtensionRequestResult,
} from '../reservations/reservation-extension.service';
import {
  ReservationService,
  type StockConfirmationRequestResult,
} from '../reservations/reservation.service';
import { ConfirmStockRequestDto, ExtendReservationRequestDto } from './dto/admin-order-actions.dto';

@Controller('admin/orders')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN)
export class AdminOrderActionsController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly extensions: ReservationExtensionService,
  ) {}

  @Post(':id/confirm-stock')
  @HttpCode(HttpStatus.ACCEPTED)
  confirmStock(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: ConfirmStockRequestDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<StockConfirmationRequestResult> {
    return this.reservations.requestStockConfirmation({
      orderId,
      expectedVersion: dto.expectedVersion,
      actorUserId: principal.userId,
      actorRole: principal.role,
      ...(dto.reason?.trim() ? { reason: dto.reason.trim() } : {}),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }

  @Post(':id/extend-reservation')
  @HttpCode(HttpStatus.ACCEPTED)
  extendReservation(
    @Param('id', new ParseUUIDPipe()) orderId: string,
    @Body() dto: ExtendReservationRequestDto,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AuthenticatedRequest,
  ): Promise<ReservationExtensionRequestResult> {
    return this.extensions.request({
      orderId,
      expectedVersion: dto.expectedVersion,
      actorUserId: principal.userId,
      actorRole: principal.role,
      reason: dto.reason.trim(),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
    });
  }
}
