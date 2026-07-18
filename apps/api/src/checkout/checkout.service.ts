import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type PickupLocation } from '@prisma/client';
import {
  type CheckoutFieldError,
  type CheckoutValidationResult,
  type PickupLocationView,
} from '@pro-dessert/contracts';
import { validateCheckoutFields } from '../cart/cart-domain';
import { CartService } from '../cart/cart.service';
import { type Environment } from '../common/config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { type CheckoutDto } from './dto/checkout.dto';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly config: ConfigService<Environment, true>,
  ) {}

  async validate(dto: CheckoutDto, cartId: string): Promise<CheckoutValidationResult> {
    const pickup = await this.location();
    const validation = await this.cart.validate(cartId);
    const fieldErrors = this.fieldErrors(dto, pickup);
    const cartRevisionChanged = dto.cartUpdatedAt !== validation.view.updatedAt;
    if (validation.materiallyChanged || cartRevisionChanged) {
      fieldErrors.push({
        field: 'cart',
        code: 'CART_CHANGED_REVIEW_REQUIRED',
        message: 'Цена или количество изменились. Проверьте обновлённую корзину.',
      });
    } else if (!validation.view.canCheckout) {
      fieldErrors.push({
        field: 'cart',
        code: validation.view.items.length === 0 ? 'CART_EMPTY' : 'CART_INVALID',
        message:
          validation.view.items.length === 0
            ? 'Добавьте товары в корзину.'
            : 'Проверьте позиции корзины перед оформлением.',
      });
    }
    return {
      valid: fieldErrors.length === 0,
      cart: validation.view,
      pickup: this.toPublicLocation(pickup),
      fulfillmentMethod: 'PICKUP',
      paymentMethod: 'BANK_TRANSFER',
      notices: validation.view.notices,
      fieldErrors,
    };
  }

  async location(): Promise<PickupLocation> {
    const code = this.config.get('PICKUP_LOCATION_CODE', { infer: true });
    const pickup = await this.prisma.pickupLocation.findFirst({ where: { code, active: true } });
    if (!pickup) {
      throw new ServiceUnavailableException({
        code: 'PICKUP_LOCATION_UNAVAILABLE',
        message: 'Точка самовывоза временно недоступна. Попробуйте позже.',
      });
    }
    return pickup;
  }

  fieldErrors(dto: CheckoutDto, pickup: Pick<PickupLocation, 'timezone'>): CheckoutFieldError[] {
    return validateCheckoutFields(dto, pickup.timezone);
  }

  toPublicLocation(
    pickup: Pick<
      PickupLocation,
      'code' | 'name' | 'addressText' | 'timezone' | 'phone' | 'openingHours'
    >,
  ): PickupLocationView {
    return {
      code: pickup.code,
      name: pickup.name,
      addressText: pickup.addressText,
      timezone: pickup.timezone,
      phone: pickup.phone,
      openingHours: pickup.openingHours,
    };
  }
}
