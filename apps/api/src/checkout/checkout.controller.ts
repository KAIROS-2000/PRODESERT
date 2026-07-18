import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type CheckoutValidationResult, type OrderCreatedView } from '@pro-dessert/contracts';
import { type Request, type Response } from 'express';
import { CartCookieService } from '../cart/cart-cookie.service';
import { CartService } from '../cart/cart.service';
import { type CartAccess } from '../cart/cart.types';
import {
  OptionalSessionGuard,
  type RequestWithOptionalPrincipal,
} from '../cart/optional-session.guard';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { OrdersService } from './orders.service';

type CheckoutRequest = Request & RequestWithOptionalPrincipal & { correlationId?: string };

@Controller()
@UseGuards(OptionalSessionGuard)
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: OrdersService,
    private readonly cart: CartService,
    private readonly cartCookies: CartCookieService,
  ) {}

  @Post('checkout/validate')
  @HttpCode(200)
  async validate(
    @Body() dto: CheckoutDto,
    @Req() request: CheckoutRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckoutValidationResult> {
    const access = await this.open(request, response);
    return this.checkout.validate(dto, access.cartId);
  }

  @Post('orders')
  @Header('Cache-Control', 'private, no-store, max-age=0')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async create(
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CheckoutRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderCreatedView> {
    this.assertIdempotencyKey(idempotencyKey);
    const access = await this.open(request, response);
    return this.orders.create(dto, access, idempotencyKey, request.correlationId);
  }

  private async open(request: CheckoutRequest, response: Response): Promise<CartAccess> {
    const access = await this.cart.access(request.principal, this.cartCookies.read(request));
    if (access.guestTokenRaw) this.cartCookies.set(response, access.guestTokenRaw);
    return access;
  }

  private assertIdempotencyKey(value: string | undefined): asserts value is string {
    if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_INVALID',
        message: 'Передайте Idempotency-Key длиной от 8 до 128 символов.',
      });
    }
  }
}
