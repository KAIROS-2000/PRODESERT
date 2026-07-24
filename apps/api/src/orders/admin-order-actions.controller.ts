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
  ReservationService,
  type StockConfirmationRequestResult,
} from '../reservations/reservation.service';
import { ConfirmStockRequestDto } from './dto/admin-order-actions.dto';

@Controller('admin/orders')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.MANAGER, Role.ADMIN)
export class AdminOrderActionsController {
  constructor(private readonly reservations: ReservationService) {}

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
}
