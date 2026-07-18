import { Controller, Get, Header, Headers, Param, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type PublicOrderView } from '@pro-dessert/contracts';
import { type Request } from 'express';
import {
  OptionalSessionGuard,
  type RequestWithOptionalPrincipal,
} from '../cart/optional-session.guard';
import { OrdersService } from './orders.service';

type OrderRequest = Request & RequestWithOptionalPrincipal;

@Controller('orders')
@UseGuards(OptionalSessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('public/:number')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  publicOrder(
    @Param('number') publicNumber: string,
    @Headers('authorization') authorization: string | undefined,
    @Req() request: OrderRequest,
  ): Promise<PublicOrderView> {
    return this.orders.publicOrder(
      publicNumber.toUpperCase(),
      this.bearerToken(authorization),
      request.principal,
    );
  }

  private bearerToken(authorization: string | undefined): string | undefined {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization ?? '');
    return match?.[1];
  }
}
