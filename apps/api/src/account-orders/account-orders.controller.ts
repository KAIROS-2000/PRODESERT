import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  type AccountOrderDetail,
  type AccountOrdersOverview,
  type AccountOrdersPage,
  type RepeatOrderPreview,
  type RepeatOrderResult,
} from '@pro-dessert/contracts';
import { Throttle } from '@nestjs/throttler';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { type AuthenticatedPrincipal, type AuthenticatedRequest } from '../auth/auth.types';
import { AccountOrdersService } from './account-orders.service';
import { AccountOrdersQueryDto } from './dto/account-orders-query.dto';
import { RepeatOrderService } from './repeat-order.service';

@Controller('account')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class AccountOrdersController {
  constructor(
    private readonly orders: AccountOrdersService,
    private readonly repeatOrders: RepeatOrderService,
  ) {}

  @Get('overview')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  overview(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<AccountOrdersOverview> {
    return this.orders.overview(principal.userId);
  }

  @Get('orders')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  history(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: AccountOrdersQueryDto,
  ): Promise<AccountOrdersPage> {
    return this.orders.history(principal.userId, query);
  }

  @Get('orders/:publicNumber')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  detail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('publicNumber') publicNumber: string,
  ): Promise<AccountOrderDetail> {
    return this.orders.detail(principal.userId, publicNumber);
  }

  @Get('orders/:publicNumber/repeat/preview')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  repeatPreview(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('publicNumber') publicNumber: string,
  ): Promise<RepeatOrderPreview> {
    return this.repeatOrders.preview(principal, publicNumber);
  }

  @Post('orders/:publicNumber/repeat')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  repeat(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('publicNumber') publicNumber: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<RepeatOrderResult> {
    return this.repeatOrders.execute(
      principal,
      publicNumber,
      idempotencyKey ?? '',
      request.correlationId,
    );
  }
}
