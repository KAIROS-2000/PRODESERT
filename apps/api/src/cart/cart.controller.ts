import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type CartView } from '@pro-dessert/contracts';
import { type Request, type Response } from 'express';
import { CartCookieService } from './cart-cookie.service';
import { CartService } from './cart.service';
import { type CartAccess } from './cart.types';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { OptionalSessionGuard, type RequestWithOptionalPrincipal } from './optional-session.guard';

type CartRequest = Request & RequestWithOptionalPrincipal;

@Controller('cart')
@UseGuards(OptionalSessionGuard)
export class CartController {
  constructor(
    private readonly cart: CartService,
    private readonly cookies: CartCookieService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, no-store, max-age=0')
  async get(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    const access = await this.open(request, response);
    return (await this.cart.validate(access.cartId)).view;
  }

  @Post('items')
  async add(
    @Body() dto: AddCartItemDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    const access = await this.open(request, response);
    return this.cart.addItem(access.cartId, dto.variantId, dto.quantity);
  }

  @Patch('items/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    const access = await this.open(request, response);
    return this.cart.updateItem(access.cartId, id, dto.quantity);
  }

  @Delete('items/:id')
  @HttpCode(204)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const access = await this.open(request, response);
    await this.cart.removeItem(access.cartId, id);
  }

  @Delete()
  @HttpCode(204)
  async clear(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const access = await this.open(request, response);
    await this.cart.clear(access.cartId);
  }

  @Post('merge')
  @HttpCode(200)
  async merge(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    const rawGuestToken = this.cookies.read(request);
    const result = await this.cart.merge(request.principal, rawGuestToken);
    if (rawGuestToken) this.cookies.clear(response);
    return result;
  }

  @Post('validate')
  @HttpCode(200)
  async validate(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartView> {
    const access = await this.open(request, response);
    return (await this.cart.validate(access.cartId)).view;
  }

  private async open(request: CartRequest, response: Response): Promise<CartAccess> {
    const access = await this.cart.access(request.principal, this.cookies.read(request));
    if (access.guestTokenRaw) this.cookies.set(response, access.guestTokenRaw);
    return access;
  }
}
